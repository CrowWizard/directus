import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

export default (router, context) => {
  const { database, env } = context;

  router.get('/accept', async (req, res, next) => {
    try {
      const result = await acceptInquiry(database, req);
      return redirectToInquiry(res, env, result.inquiry_item_id);
    } catch (error) {
      if (error instanceof AcceptError) {
        return sendError(res, error.status, error.message);
      }

      return next(error);
    }
  });

  router.get('/accept-json', async (req, res, next) => {
    try {
      const result = await acceptInquiry(database, req);
      return res.json({ data: result });
    } catch (error) {
      if (error instanceof AcceptError) {
        return sendError(res, error.status, error.message);
      }

      return next(error);
    }
  });
};

async function acceptInquiry(database, req) {
  const token = String(req.query.token ?? '');

  if (!token) {
    throw new AcceptError(400, '缺少接单 Token。');
  }

  const userId = req.accountability?.user;

  if (!userId) {
    throw new AcceptError(401, '请先登录后再开始处理询价项。');
  }

  const tokenHash = hashToken(token);
  const acceptToken = await getAcceptToken(database, tokenHash);

  if (!acceptToken) {
    throw new AcceptError(403, '接单链接无效或已失效。');
  }

  if (!safeEqual(tokenHash, acceptToken.token_hash)) {
    throw new AcceptError(403, '接单链接校验失败。');
  }

  if (acceptToken.used_at) {
    return { inquiry_item_id: acceptToken.inquiry_item_id };
  }

  if (new Date(acceptToken.expires_at).getTime() < Date.now()) {
    throw new AcceptError(403, '接单链接已过期。');
  }

  if (String(acceptToken.buyer_id) !== String(userId)) {
    throw new AcceptError(403, '你不是当前采购负责人，不能开始处理该询价项。');
  }

  const inquiry = await database('inquiry_items')
    .select('id', 'buyer_owner_id', 'sales_owner_id', 'accepted_at', 'state')
    .where({ id: acceptToken.inquiry_item_id })
    .first();

  if (!inquiry) {
    throw new AcceptError(404, '关联询价项不存在。');
  }

  if (String(inquiry.buyer_owner_id) !== String(userId)) {
    throw new AcceptError(403, '该询价项已重新分配，当前链接不能继续使用。');
  }

  if (!inquiry.accepted_at) {
    const now = new Date();

    await database.transaction(async (trx) => {
      await trx('inquiry_items')
        .where({ id: inquiry.id })
        .update({ accepted_at: now, state: 'Purchasing' });

      await trx('assignment_accept_tokens')
        .where({ id: acceptToken.id })
        .update({ used_at: now });
    });

    await refreshTaskSummariesForInquiry(database, {
      ...inquiry,
      accepted_at: now,
      state: 'Purchasing',
    });
  }

  return { inquiry_item_id: inquiry.id };
}

async function getAcceptToken(database, tokenHash) {
  return database('assignment_accept_tokens')
    .select('id', 'inquiry_item_id', 'buyer_id', 'token_hash', 'expires_at', 'used_at')
    .where({ token_hash: tokenHash })
    .first();
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

async function refreshTaskSummariesForInquiry(database, inquiry) {
  if (!inquiry) {
    return;
  }

  if (inquiry.buyer_owner_id) {
    await refreshBuyerTaskCounts(database, inquiry.buyer_owner_id);
  }

  const userIds = new Set([inquiry.sales_owner_id, inquiry.buyer_owner_id].filter(Boolean).map(String));
  const managerIds = await getManagerUserIds(database);

  for (const userId of userIds) {
    const roleScope = await getUserTaskRoleScope(database, userId);

    if (roleScope) {
      await refreshUserTaskSummary(database, userId, roleScope);
    }
  }

  for (const managerId of managerIds) {
    await refreshUserTaskSummary(database, managerId, 'Manager');
  }
}

async function refreshBuyerTaskCounts(database, buyerId) {
  const activeResult = await database('inquiry_items')
    .where({ buyer_owner_id: buyerId })
    .whereNotIn('state', ['Quoted', 'Closed'])
    .count({ count: '*' })
    .first();

  const completedResult = await database('inquiry_items')
    .where({ buyer_owner_id: buyerId })
    .whereIn('state', ['Quoted', 'Closed'])
    .count({ count: '*' })
    .first();

  await database('buyer_profiles')
    .where({ buyer_id: buyerId })
    .update({
      active_task_count: Number(activeResult?.count || 0),
      completed_task_count: Number(completedResult?.count || 0),
    });
}

async function refreshUserTaskSummary(database, userId, roleScope) {
  const activeTasks = await getTasksForSummary(database, userId, roleScope, 'active');
  const totalCompletedTasks = await getTasksForSummary(database, userId, roleScope, 'completed');
  const weeklyCompletedTasks = await getTasksForSummary(database, userId, roleScope, 'weekly_completed');

  const payload = {
    user_id: userId,
    role_scope: roleScope,
    active_task_count: activeTasks.length,
    total_completed_task_count: totalCompletedTasks.length,
    weekly_completed_task_count: weeklyCompletedTasks.length,
    active_task_details: JSON.stringify(activeTasks),
    weekly_completed_task_details: JSON.stringify(weeklyCompletedTasks),
    refreshed_at: new Date(),
  };

  const existing = await database('user_task_summaries')
    .select('id')
    .where({ user_id: userId, role_scope: roleScope })
    .first();

  if (existing) {
    await database('user_task_summaries').where({ id: existing.id }).update(payload);
    return;
  }

  await database('user_task_summaries').insert({ id: randomUUID(), ...payload });
}

async function getTasksForSummary(database, userId, roleScope, mode) {
  const query = database('inquiry_items')
    .select(
      'id',
      'inquiry_no',
      'product_name',
      'brand',
      'priority',
      'state',
      'buyer_owner_id',
      'sales_owner_id',
      'assignment_deadline',
      'completed_at',
      'updated_at',
    )
    .orderBy('updated_at', 'desc')
    .limit(50);

  if (roleScope === 'Sales') {
    query.where({ sales_owner_id: userId });
  } else if (roleScope === 'Buyer') {
    query.where({ buyer_owner_id: userId });
  }

  if (mode === 'active') {
    if (roleScope === 'Sales') {
      query.whereIn('state', ['Draft', 'WaitingSalesReview']);
    } else if (roleScope === 'Buyer') {
      query.whereIn('state', ['Assigned', 'Purchasing']);
    } else if (roleScope === 'Manager') {
      query.whereIn('state', ['Assigned', 'Purchasing', 'WaitingSalesReview']);
    }
  } else if (mode === 'completed') {
    query.whereIn('state', ['Quoted', 'Closed']);
  } else if (mode === 'weekly_completed') {
    query.whereIn('state', ['Quoted', 'Closed']).where('completed_at', '>=', getWeekStart());
  }

  const rows = await query;

  return rows.map((task) => ({
    id: task.id,
    inquiry_no: task.inquiry_no,
    product_name: task.product_name,
    brand: task.brand,
    priority: task.priority,
    state: task.state,
    buyer_owner_id: task.buyer_owner_id,
    sales_owner_id: task.sales_owner_id,
    assignment_deadline: task.assignment_deadline,
    completed_at: task.completed_at,
    updated_at: task.updated_at,
  }));
}

async function getUserTaskRoleScope(database, userId) {
  const user = await database('directus_users')
    .leftJoin('directus_roles', 'directus_users.role', 'directus_roles.id')
    .select('directus_roles.name as role_name')
    .where('directus_users.id', userId)
    .first();

  if (user?.role_name === '外贸员') {
    return 'Sales';
  }

  if (user?.role_name === '采购员') {
    return 'Buyer';
  }

  if (user?.role_name === '经理') {
    return 'Manager';
  }

  return null;
}

async function getManagerUserIds(database) {
  const managerRole = await database('directus_roles').select('id').where({ name: '经理' }).first();

  if (!managerRole) {
    return [];
  }

  const users = await database('directus_users').select('id').where({ role: managerRole.id, status: 'active' });
  return users.map((user) => user.id);
}

function getWeekStart() {
  const now = new Date();
  const day = now.getDay() || 7;
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(now.getDate() - day + 1);
  return weekStart;
}

function redirectToInquiry(res, env, inquiryItemId) {
  const purchaseAppUrl = env.PUBLIC_PURCHASE_FLOW_WEB_URL || env.PUBLIC_PURCHASE_APP_URL || env.PUBLIC_APP_URL || 'http://localhost:5173';
  return res.redirect(`${purchaseAppUrl}/inquiry-items/${inquiryItemId}/detail`);
}

function sendError(res, status, message) {
  return res.status(status).json({
    errors: [
      {
        message,
        extensions: { code: 'PURCHASE_FLOW_ACCEPT_ERROR' },
      },
    ],
  });
}

class AcceptError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
