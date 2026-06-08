import { createHash, randomBytes, randomUUID } from 'node:crypto';

const targetCollections = new Set([
  'customers',
  'customer_contacts',
  'suppliers',
  'supplier_contacts',
  'inquiry_items',
  'supplier_quotes',
  'customer_quotes',
  'conversations',
  'attachments',
  'buyer_profiles',
  'priority_rules',
  'assignment_rules',
  'assignment_accept_tokens',
  'manager_approvals',
  'user_task_summaries',
]);

const finishedStates = new Set(['Quoted', 'Closed']);

export default ({ filter, action }, context) => {
  const { database, env, logger } = context;

  filter('items.create', async (payload, meta) => {
    if (!targetCollections.has(meta.collection)) {
      return payload;
    }

    payload = addPrimaryKey(payload);

    if (meta.collection === 'inquiry_items') {
      payload = await addInquiryNo(database, payload);
    }

    return payload;
  });

  action('items.create', async (meta) => {
    if (meta.collection !== 'inquiry_items') {
      return;
    }

    await prepareInquiryAssignment(database, env, logger, meta.key);
  });

  action('items.update', async (meta) => {
    if (meta.collection !== 'inquiry_items') {
      return;
    }

    const keys = Array.isArray(meta.keys) ? meta.keys : [meta.key].filter(Boolean);

    for (const key of keys) {
      await prepareInquiryAssignment(database, env, logger, key);
    }
  });
};

function addPrimaryKey(payload) {
  if (Array.isArray(payload)) {
    return payload.map((item) => addPrimaryKey(item));
  }

  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  if (!payload.id) {
    payload.id = randomUUID();
  }

  return payload;
}

async function addInquiryNo(database, payload) {
  if (Array.isArray(payload)) {
    return Promise.all(payload.map((item) => addInquiryNo(database, item)));
  }

  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  if (payload.inquiry_no) {
    return payload;
  }

  const today = formatDate(new Date());
  const prefix = `INQ-${today}-`;

  const lastRow = await database('inquiry_items')
    .select('inquiry_no')
    .where('inquiry_no', 'like', `${prefix}%`)
    .orderBy('inquiry_no', 'desc')
    .first();

  let seq = 1;

  if (lastRow?.inquiry_no) {
    const lastSeq = parseInt(lastRow.inquiry_no.slice(prefix.length), 10);
    if (!isNaN(lastSeq) && lastSeq >= 1) {
      seq = lastSeq + 1;
    }
  }

  payload.inquiry_no = `${prefix}${String(seq).padStart(4, '0')}`;

  return payload;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

async function prepareInquiryAssignment(database, env, logger, inquiryItemId) {
  if (!inquiryItemId) {
    return;
  }

  const inquiry = await getInquiry(database, inquiryItemId);

  if (!inquiry || finishedStates.has(inquiry.state)) {
    return;
  }

  const buyerId = inquiry.buyer_owner_id || (await assignBuyer(database, inquiry));

  if (!buyerId) {
    logger.warn(`询价项 ${inquiry.id} 没有可用采购员，已跳过自动分配。`);
    return;
  }

  const priorityRule = await getPriorityRule(database, inquiry.priority);
  const now = new Date();
  const assignmentDeadline = addMinutes(now, priorityRule.assignment_timeout_minutes);
  const nextReminderAt = addMinutes(now, priorityRule.reminder_interval_minutes);

  const patch = {};

  if (!inquiry.buyer_owner_id) {
    patch.buyer_owner_id = buyerId;
  }

  if (!inquiry.state || inquiry.state === 'Draft') {
    patch.state = 'Assigned';
  }

  if (finishedStates.has(inquiry.state) && !inquiry.completed_at) {
    patch.completed_at = now;
  }

  if (!inquiry.assignment_deadline) {
    patch.assignment_deadline = assignmentDeadline;
  }

  if (!inquiry.next_reminder_at) {
    patch.next_reminder_at = nextReminderAt;
  }

  if (Object.keys(patch).length > 0) {
    await database('inquiry_items').where({ id: inquiry.id }).update(patch);
    await refreshBuyerTaskCounts(database, buyerId);
  }

  await refreshTaskSummariesForInquiry(database, inquiry.id, buyerId);

  const acceptUrl = await createAcceptTokenForInquiry(database, env, inquiry.id, buyerId);

  if (acceptUrl) {
    await notifyBuyer(database, env, logger, inquiry, buyerId, acceptUrl);
  }
}

async function refreshTaskSummariesForInquiry(database, inquiryItemId, buyerId) {
  const inquiry = await database('inquiry_items')
    .select('sales_owner_id', 'buyer_owner_id')
    .where({ id: inquiryItemId })
    .first();

  const userIds = new Set([inquiry?.sales_owner_id, inquiry?.buyer_owner_id, buyerId].filter(Boolean).map(String));
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

async function getInquiry(database, inquiryItemId) {
  return database('inquiry_items')
    .select(
      'id',
      'inquiry_no',
      'product_name',
      'brand',
      'tags',
      'priority',
      'buyer_owner_id',
      'accepted_at',
      'assignment_deadline',
      'next_reminder_at',
      'state',
      'completed_at',
    )
    .where({ id: inquiryItemId })
    .first();
}

async function assignBuyer(database, inquiry) {
  const candidates = await database('buyer_profiles')
    .select('buyer_id', 'tags', 'brands', 'score', 'active_task_count', 'completed_task_count')
    .where({ is_available: true });

  if (candidates.length === 0) {
    return null;
  }

  const historyBrandBuyerIds = await getHistoryBrandBuyerIds(database, inquiry.brand);
  const inquiryTags = splitCsv(inquiry.tags);
  const brand = normalizeText(inquiry.brand);

  const ranked = candidates
    .map((candidate) => ({
      ...candidate,
      rank: calculateBuyerRank(candidate, inquiryTags, brand, historyBrandBuyerIds),
    }))
    .sort((left, right) => {
      if (right.rank !== left.rank) {
        return right.rank - left.rank;
      }

      const leftActive = Number(left.active_task_count || 0);
      const rightActive = Number(right.active_task_count || 0);

      if (leftActive !== rightActive) {
        return leftActive - rightActive;
      }

      return Number(right.score || 0) - Number(left.score || 0);
    });

  return ranked[0]?.buyer_id ?? null;
}

function calculateBuyerRank(candidate, inquiryTags, brand, historyBrandBuyerIds) {
  let rank = 0;
  const buyerTags = splitCsv(candidate.tags);
  const buyerBrands = splitCsv(candidate.brands);
  const activeTaskCount = Number(candidate.active_task_count || 0);

  if (activeTaskCount === 0 && hasIntersection(buyerTags, inquiryTags)) {
    rank += 1000;
  }

  if (brand && buyerBrands.includes(brand)) {
    rank += 500;
  }

  if (historyBrandBuyerIds.has(String(candidate.buyer_id))) {
    rank += 300;
  }

  rank += Number(candidate.score || 0);
  rank -= activeTaskCount * 10;

  return rank;
}

async function getHistoryBrandBuyerIds(database, brand) {
  const normalizedBrand = normalizeText(brand);

  if (!normalizedBrand) {
    return new Set();
  }

  const rows = await database('inquiry_items')
    .select('buyer_owner_id')
    .whereNotNull('buyer_owner_id')
    .whereIn('state', ['Quoted', 'Closed'])
    .whereRaw('LOWER(brand) = ?', [normalizedBrand])
    .limit(50);

  return new Set(rows.map((row) => String(row.buyer_owner_id)));
}

async function getPriorityRule(database, priority) {
  const rule = await database('priority_rules')
    .select('assignment_timeout_minutes', 'reminder_interval_minutes')
    .where({ priority: priority || 'Normal' })
    .first();

  return {
    assignment_timeout_minutes: Number(rule?.assignment_timeout_minutes || 120),
    reminder_interval_minutes: Number(rule?.reminder_interval_minutes || 60),
  };
}

async function createAcceptTokenForInquiry(database, env, inquiryItemId, buyerId) {
  if (!inquiryItemId || !buyerId) {
    return null;
  }

  const inquiry = await database('inquiry_items')
    .select('id', 'accepted_at', 'state')
    .where({ id: inquiryItemId })
    .first();

  if (!inquiry || inquiry.accepted_at || finishedStates.has(inquiry.state)) {
    return null;
  }

  const existing = await database('assignment_accept_tokens')
    .select('id')
    .where({ inquiry_item_id: inquiry.id, buyer_id: buyerId, used_at: null })
    .where('expires_at', '>', new Date())
    .first();

  if (existing) {
    return null;
  }

  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const ttlHours = Number(env.ACCEPT_TOKEN_TTL_HOURS || 24);
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  await database('assignment_accept_tokens').insert({
    id: randomUUID(),
    inquiry_item_id: inquiry.id,
    buyer_id: buyerId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  const publicAppUrl = env.PUBLIC_APP_URL || 'http://localhost:8055';
  return `${publicAppUrl}/purchase-flow-accept/accept?token=${token}`;
}

async function notifyBuyer(database, env, logger, inquiry, buyerId, acceptUrl) {
  if (!env.WECHAT_WORK_WEBHOOK_URL) {
    logger.info(`采购接单链接已生成：${acceptUrl}`);
    return;
  }

  const mention = await getWechatMention(database, buyerId);

  const content = [
    mention,
    '**新的采购询价待处理**',
    `询价编号：${inquiry.inquiry_no || inquiry.id}`,
    `产品：${inquiry.product_name || '-'}`,
    `品牌：${inquiry.brand || '-'}`,
    `优先级：${inquiry.priority || 'Normal'}`,
    `接单链接：[点击开始处理](${acceptUrl})`,
  ].filter(Boolean).join('\n');

  try {
    const response = await fetch(env.WECHAT_WORK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'markdown',
        markdown: { content },
      }),
    });

    if (!response.ok) {
      logger.warn(`企业微信通知失败：${response.status} ${response.statusText}`);
    }
  } catch (error) {
    logger.warn(`企业微信通知异常：${error.message}`);
  }
}

async function getWechatMention(database, userId) {
  const user = await database('directus_users')
    .select('wechat_work_userid')
    .where({ id: userId })
    .first();

  if (!user?.wechat_work_userid) {
    return '';
  }

  return `<@${user.wechat_work_userid}>`;
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

function splitCsv(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map(normalizeText).filter(Boolean);
  }

  return String(value)
    .split(',')
    .map(normalizeText)
    .filter(Boolean);
}

function hasIntersection(left, right) {
  return left.some((item) => right.includes(item));
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + Number(minutes || 0) * 60 * 1000);
}

function getWeekStart() {
  const now = new Date();
  const day = now.getDay() || 7;
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(now.getDate() - day + 1);
  return weekStart;
}
