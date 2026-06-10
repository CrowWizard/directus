import { createHash, randomBytes, randomUUID } from 'node:crypto';

const finishedStates = new Set(['Quoted', 'Closed']);
const supplierQuoteRequiredFields = ['supplier_id', 'price', 'currency', 'lead_time', 'inquiry_price', 'quoted_by', 'quoted_at'];

export default (router, context) => {
  const { database, env, logger } = context;

  router.post('/run', async (req, res, next) => {
    try {
      await assertScannerAuthorized(database, req, env);

      const assignmentTimeouts = await scanAssignmentTimeouts(database, env, logger);
      const supplierQuoteReminders = await scanSupplierQuoteReminders(database, env, logger);

      return res.json({ data: { assignment_timeouts: assignmentTimeouts, supplier_quote_reminders: supplierQuoteReminders } });
    } catch (error) {
      return handleError(res, next, error);
    }
  });

  router.post('/scan-assignment-timeouts', async (req, res, next) => {
    try {
      await assertScannerAuthorized(database, req, env);

      const result = await scanAssignmentTimeouts(database, env, logger);
      return res.json({ data: result });
    } catch (error) {
      return handleError(res, next, error);
    }
  });

  router.post('/scan-supplier-quote-reminders', async (req, res, next) => {
    try {
      await assertScannerAuthorized(database, req, env);

      const result = await scanSupplierQuoteReminders(database, env, logger);
      return res.json({ data: result });
    } catch (error) {
      return handleError(res, next, error);
    }
  });
};

async function assertScannerAuthorized(database, req, env) {
  const secret = env.PURCHASE_FLOW_SCANNER_SECRET;
  const providedSecret = String(req.headers?.['x-purchase-flow-scanner-secret'] || '');

  if (secret && providedSecret === String(secret)) {
    return;
  }

  const userId = req.accountability?.user;

  if (!userId) {
    throw new ScannerError(401, '请先登录，或配置 PURCHASE_FLOW_SCANNER_SECRET 后通过 Header 调用。');
  }

  const roleScope = await getUserTaskRoleScope(database, userId);

  if (roleScope !== 'Manager') {
    throw new ScannerError(403, '只有经理可以手动触发采购流程扫描。');
  }
}

async function scanAssignmentTimeouts(database, env, logger) {
  const now = new Date();
  const inquiries = await database('inquiry_items')
    .select(
      'id',
      'inquiry_no',
      'product_name',
      'brand',
      'tags',
      'priority',
      'buyer_owner_id',
      'sales_owner_id',
      'assignment_deadline',
      'next_reminder_at',
      'state',
    )
    .where({ state: 'Assigned' })
    .whereNull('accepted_at')
    .whereNotNull('assignment_deadline')
    .where('assignment_deadline', '<=', now)
    .limit(Number(env.PURCHASE_FLOW_SCAN_LIMIT || 50));

  const processed = [];
  const skipped = [];

  for (const inquiry of inquiries) {
    const previousBuyerId = inquiry.buyer_owner_id;
    const nextBuyerId = await assignBuyer(database, inquiry, previousBuyerId);

    if (!nextBuyerId) {
      skipped.push({ inquiry_item_id: inquiry.id, reason: '没有可用采购员' });
      continue;
    }

    const priorityRule = await getPriorityRule(database, inquiry.priority);
    const assignmentDeadline = addMinutes(now, priorityRule.assignment_timeout_minutes);
    const nextReminderAt = addMinutes(now, priorityRule.reminder_interval_minutes);
    const acceptUrl = await database.transaction(async (trx) => {
      await trx('assignment_accept_tokens')
        .where({ inquiry_item_id: inquiry.id })
        .whereNull('used_at')
        .update({ used_at: now });

      await trx('inquiry_items')
        .where({ id: inquiry.id })
        .update({
          buyer_owner_id: nextBuyerId,
          state: 'Assigned',
          accepted_at: null,
          assignment_deadline: assignmentDeadline,
          next_reminder_at: nextReminderAt,
          updated_at: now,
        });

      await trx('conversations').insert({
        id: randomUUID(),
        inquiry_item_id: inquiry.id,
        actor_id: previousBuyerId || nextBuyerId,
        content: buildReassignmentConversation(inquiry, previousBuyerId, nextBuyerId),
        metadata: JSON.stringify({
          action: 'assignment_timeout_reassign',
          previous_buyer_id: previousBuyerId,
          next_buyer_id: nextBuyerId,
          assignment_deadline: inquiry.assignment_deadline,
        }),
        created_at: now,
      });

      return createAcceptTokenForInquiry(trx, env, inquiry.id, nextBuyerId, now);
    });

    await refreshAfterAssignment(database, inquiry, previousBuyerId, nextBuyerId);
    await notifyBuyer(database, env, logger, inquiry, nextBuyerId, acceptUrl, '采购询价已超时重新分配');

    processed.push({ inquiry_item_id: inquiry.id, previous_buyer_id: previousBuyerId, next_buyer_id: nextBuyerId });
  }

  return { scanned: inquiries.length, processed, skipped };
}

async function scanSupplierQuoteReminders(database, env, logger) {
  const now = new Date();
  const inquiries = await database('inquiry_items')
    .select(
      'id',
      'inquiry_no',
      'product_name',
      'brand',
      'priority',
      'buyer_owner_id',
      'next_reminder_at',
      'state',
    )
    .where({ state: 'Purchasing' })
    .whereNotNull('buyer_owner_id')
    .where((builder) => {
      builder.whereNull('next_reminder_at').orWhere('next_reminder_at', '<=', now);
    })
    .limit(Number(env.PURCHASE_FLOW_SCAN_LIMIT || 50));

  const reminded = [];
  const skipped = [];

  for (const inquiry of inquiries) {
    const missingFields = await getSupplierQuoteMissingFields(database, inquiry.id);

    if (missingFields.length === 0) {
      skipped.push({ inquiry_item_id: inquiry.id, reason: '供应商报价字段完整' });
      continue;
    }

    const priorityRule = await getPriorityRule(database, inquiry.priority);
    const nextReminderAt = addMinutes(now, priorityRule.reminder_interval_minutes);

    await database.transaction(async (trx) => {
      await trx('inquiry_items')
        .where({ id: inquiry.id })
        .update({ next_reminder_at: nextReminderAt, updated_at: now });

      await trx('conversations').insert({
        id: randomUUID(),
        inquiry_item_id: inquiry.id,
        actor_id: inquiry.buyer_owner_id,
        content: buildSupplierQuoteReminderConversation(missingFields),
        metadata: JSON.stringify({
          action: 'supplier_quote_missing_fields_reminder',
          missing_fields: missingFields,
        }),
        created_at: now,
      });
    });

    await notifyBuyer(
      database,
      env,
      logger,
      inquiry,
      inquiry.buyer_owner_id,
      null,
      `供应商报价信息待补充：${missingFields.join('、')}`,
    );

    reminded.push({ inquiry_item_id: inquiry.id, buyer_id: inquiry.buyer_owner_id, missing_fields: missingFields });
  }

  return { scanned: inquiries.length, reminded, skipped };
}

async function getSupplierQuoteMissingFields(database, inquiryItemId) {
  const quotes = await database('supplier_quotes')
    .select(...supplierQuoteRequiredFields)
    .where({ inquiry_item_id: inquiryItemId });

  if (quotes.length === 0) {
    return supplierQuoteRequiredFields;
  }

  const recommendedQuote = await database('supplier_quotes')
    .select(...supplierQuoteRequiredFields)
    .where({ inquiry_item_id: inquiryItemId, is_recommended: true })
    .first();

  const quote = recommendedQuote || quotes[0];

  return supplierQuoteRequiredFields.filter((field) => isBlank(quote[field]));
}

async function assignBuyer(database, inquiry, excludedBuyerId) {
  const query = database('buyer_profiles')
    .select('buyer_id', 'tags', 'brands', 'score', 'active_task_count', 'completed_task_count')
    .where({ is_available: true });

  if (excludedBuyerId) {
    query.whereNot({ buyer_id: excludedBuyerId });
  }

  let candidates = await query;

  if (candidates.length === 0 && excludedBuyerId) {
    candidates = await database('buyer_profiles')
      .select('buyer_id', 'tags', 'brands', 'score', 'active_task_count', 'completed_task_count')
      .where({ is_available: true });
  }

  if (candidates.length === 0) {
    return null;
  }

  const historyBrandBuyerIds = await getHistoryBrandBuyerIds(database, inquiry.brand);
  const inquiryTags = splitCsv(inquiry.tags);
  const brand = normalizeText(inquiry.brand);

  const ranked = candidates
    .map((candidate) => ({ ...candidate, rank: calculateBuyerRank(candidate, inquiryTags, brand, historyBrandBuyerIds) }))
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

async function createAcceptTokenForInquiry(database, env, inquiryItemId, buyerId, now) {
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const ttlHours = Number(env.ACCEPT_TOKEN_TTL_HOURS || 24);
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

  await database('assignment_accept_tokens').insert({
    id: randomUUID(),
    inquiry_item_id: inquiryItemId,
    buyer_id: buyerId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  const purchaseAppUrl = env.PUBLIC_PURCHASE_FLOW_WEB_URL || env.PUBLIC_PURCHASE_APP_URL || env.PUBLIC_APP_URL || 'http://localhost:5173';
  return `${purchaseAppUrl}/purchase-flow-accept/accept?token=${token}`;
}

async function notifyBuyer(database, env, logger, inquiry, buyerId, acceptUrl, title) {
  const mention = await getWechatMention(database, buyerId);
  const lines = [
    mention,
    `**${title}**`,
    `询价编号：${inquiry.inquiry_no || inquiry.id}`,
    `产品：${inquiry.product_name || '-'}`,
    `品牌：${inquiry.brand || '-'}`,
    `优先级：${inquiry.priority || 'Normal'}`,
  ];

  if (acceptUrl) {
    lines.push(`接单链接：[点击开始处理](${acceptUrl})`);
  }

  const content = lines.filter(Boolean).join('\n');

  if (!env.WECHAT_WORK_WEBHOOK_URL) {
    logger.info(content);
    return;
  }

  try {
    const response = await fetch(env.WECHAT_WORK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'markdown', markdown: { content } }),
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

async function refreshAfterAssignment(database, inquiry, previousBuyerId, nextBuyerId) {
  const userIds = new Set([inquiry.sales_owner_id, previousBuyerId, nextBuyerId].filter(Boolean).map(String));
  const managerIds = await getManagerUserIds(database);

  for (const buyerId of [previousBuyerId, nextBuyerId].filter(Boolean)) {
    await refreshBuyerTaskCounts(database, buyerId);
  }

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

function buildReassignmentConversation(inquiry, previousBuyerId, nextBuyerId) {
  return [
    '采购接单已超时，系统已自动重新分配。',
    `原采购员：${previousBuyerId || '-'}`,
    `新采购员：${nextBuyerId}`,
    `原分配截止时间：${inquiry.assignment_deadline || '-'}`,
  ].join('\n');
}

function buildSupplierQuoteReminderConversation(missingFields) {
  return `供应商报价信息待补充：${missingFields.join('、')}。`;
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

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

function handleError(res, next, error) {
  if (error instanceof ScannerError) {
    return sendError(res, error.status, error.message);
  }

  return next(error);
}

function sendError(res, status, message) {
  return res.status(status).json({
    errors: [
      {
        message,
        extensions: { code: 'PURCHASE_FLOW_SCANNER_ERROR' },
      },
    ],
  });
}

class ScannerError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
