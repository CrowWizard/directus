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
]);

const finishedStates = new Set(['Quoted', 'Closed']);

export default ({ filter, action }, context) => {
  const { database, env, logger } = context;

  filter('items.create', (payload, meta) => {
    if (!targetCollections.has(meta.collection)) {
      return payload;
    }

    return addPrimaryKey(payload);
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

  const acceptUrl = await createAcceptTokenForInquiry(database, env, inquiry.id, buyerId);

  if (acceptUrl) {
    await notifyBuyer(env, logger, inquiry, acceptUrl);
  }
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

async function notifyBuyer(env, logger, inquiry, acceptUrl) {
  if (!env.WECHAT_WORK_WEBHOOK_URL) {
    logger.info(`采购接单链接已生成：${acceptUrl}`);
    return;
  }

  const content = [
    '**新的采购询价待处理**',
    `询价编号：${inquiry.inquiry_no || inquiry.id}`,
    `产品：${inquiry.product_name || '-'}`,
    `品牌：${inquiry.brand || '-'}`,
    `优先级：${inquiry.priority || 'Normal'}`,
    `接单链接：[点击开始处理](${acceptUrl})`,
  ].join('\n');

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
