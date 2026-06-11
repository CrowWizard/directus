import { randomUUID } from 'node:crypto';

const finishedStates = new Set(['Quoted', 'Closed']);

const allowedTransitions = new Map([
  ['Purchasing', new Set(['WaitingSalesReview'])],
  ['WaitingSalesReview', new Set(['Purchasing', 'Quoted'])],
  ['Quoted', new Set(['Closed'])],
]);

export default (router, context) => {
  const { database, env, logger } = context;

  router.get('/inquiries/:id/similar-quotes', async (req, res, next) => {
    try {
      const result = await getSimilarQuotes(database, req);
      return res.json({ data: result });
    } catch (error) {
      if (error instanceof ActionError) {
        return sendError(res, error.status, error.message);
      }

      return next(error);
    }
  });

  router.post('/communicate-and-transition', async (req, res, next) => {
    try {
      const result = await communicateAndTransition(database, env, logger, req);
      return res.json({ data: result });
    } catch (error) {
      if (error instanceof ActionError) {
        return sendError(res, error.status, error.message);
      }

      return next(error);
    }
  });

  router.post('/communicate', async (req, res, next) => {
    try {
      const result = await communicate(database, env, logger, req);
      return res.json({ data: result });
    } catch (error) {
      if (error instanceof ActionError) {
        return sendError(res, error.status, error.message);
      }

      return next(error);
    }
  });

  router.post('/complete-supplier-quote', async (req, res, next) => {
    try {
      const result = await completeSupplierQuote(database, env, logger, req);
      return res.json({ data: result });
    } catch (error) {
      if (error instanceof ActionError) {
        return sendError(res, error.status, error.message);
      }

      return next(error);
    }
  });

  router.post('/mark-viewed-as-accepted', async (req, res, next) => {
    try {
      const result = await markViewedAsAccepted(database, req);
      return res.json({ data: result });
    } catch (error) {
      if (error instanceof ActionError) {
        return sendError(res, error.status, error.message);
      }

      return next(error);
    }
  });

  router.post('/update-inquiry', async (req, res, next) => {
    try {
      const result = await updateInquiry(database, env, logger, req);
      return res.json({ data: result });
    } catch (error) {
      if (error instanceof ActionError) {
        return sendError(res, error.status, error.message);
      }

      return next(error);
    }
  });

  router.post('/select-final-quote', async (req, res, next) => {
    try {
      const result = await selectFinalQuote(database, req);
      return res.json({ data: result });
    } catch (error) {
      if (error instanceof ActionError) {
        return sendError(res, error.status, error.message);
      }

      return next(error);
    }
  });

  router.post('/close-inquiry', async (req, res, next) => {
    try {
      const result = await closeInquiry(database, req);
      return res.json({ data: result });
    } catch (error) {
      if (error instanceof ActionError) {
        return sendError(res, error.status, error.message);
      }

      return next(error);
    }
  });

  router.post('/submit-customer-quote', async (req, res, next) => {
    try {
      const result = await submitCustomerQuote(database, env, logger, req);
      return res.json({ data: result });
    } catch (error) {
      if (error instanceof ActionError) {
        return sendError(res, error.status, error.message);
      }

      return next(error);
    }
  });

  router.post('/approve-customer-quote', async (req, res, next) => {
    try {
      const result = await approveCustomerQuote(database, env, logger, req);
      return res.json({ data: result });
    } catch (error) {
      if (error instanceof ActionError) {
        return sendError(res, error.status, error.message);
      }

      return next(error);
    }
  });
};

async function getSimilarQuotes(database, req) {
  const userId = req.accountability?.user;

  if (!userId) {
    throw new ActionError(401, '请先登录后再查看历史类似报价。');
  }

  const inquiryItemId = stringOrEmpty(req.params.id);

  if (!inquiryItemId) {
    throw new ActionError(400, '缺少询价项 ID。');
  }

  const limit = clampNumber(Number(req.query.limit || 10), 1, 50);
  const candidateLimit = clampNumber(Number(req.query.candidate_limit || 200), 20, 500);
  const inquiry = await getInquiryForSimilarQuotes(database, inquiryItemId);

  if (!inquiry) {
    throw new ActionError(404, '询价项不存在。');
  }

  await assertUserCanReadInquiry(database, userId, inquiry);

  const candidates = await getSimilarQuoteCandidates(database, inquiry.id, candidateLimit);
  const scoredCandidates = candidates
    .map((candidate) => scoreSimilarQuote(inquiry, candidate))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return new Date(right.quoted_at || right.completed_at || 0).getTime() - new Date(left.quoted_at || left.completed_at || 0).getTime();
    })
    .slice(0, limit);

  return scoredCandidates;
}

async function communicateAndTransition(database, env, logger, req) {
  const userId = req.accountability?.user;

  if (!userId) {
    throw new ActionError(401, '请先登录后再操作询价项。');
  }

  const payload = normalizePayload(req.body);

  if (!payload.inquiryItemId || !payload.content || !payload.nextState) {
    throw new ActionError(400, '缺少询价项、沟通内容或目标状态。');
  }

  const now = new Date();
  let inquiryAfterUpdate = null;
  let previousState = null;

  await database.transaction(async (trx) => {
    const inquiry = await getInquiryForUpdate(trx, payload.inquiryItemId);

    if (!inquiry) {
      throw new ActionError(404, '询价项不存在。');
    }

    assertTransitionAllowed(inquiry.state, payload.nextState);
    await assertUserCanTransition(trx, userId, inquiry, payload.nextState);
    previousState = inquiry.state;

    await trx('conversations').insert({
      id: randomUUID(),
      inquiry_item_id: inquiry.id,
      actor_id: userId,
      content: payload.content,
      metadata: JSON.stringify({
        action: 'communicate_and_transition',
        from_state: inquiry.state,
        to_state: payload.nextState,
      }),
      created_at: now,
    });

    const inquiryPatch = {
      state: payload.nextState,
      updated_at: now,
    };

    if (finishedStates.has(payload.nextState) && !inquiry.completed_at) {
      inquiryPatch.completed_at = now;
    }

    await trx('inquiry_items').where({ id: inquiry.id }).update(inquiryPatch);

    inquiryAfterUpdate = {
      ...inquiry,
      ...inquiryPatch,
    };
  });

  await refreshTaskSummariesForInquiry(database, inquiryAfterUpdate);
  await notifyInquiryCounterparty(database, env, logger, inquiryAfterUpdate, userId, '报价沟通更新', payload.content);

  return {
    inquiry_item_id: inquiryAfterUpdate.id,
    previous_state: previousState,
    state: payload.nextState,
  };
}

async function communicate(database, env, logger, req) {
  const userId = req.accountability?.user;

  if (!userId) {
    throw new ActionError(401, '请先登录后再提交沟通记录。');
  }

  const payload = normalizePayload(req.body);

  if (!payload.inquiryItemId || !payload.content) {
    throw new ActionError(400, '缺少询价项或沟通内容。');
  }

  const now = new Date();
  let inquiry = null;

  await database.transaction(async (trx) => {
    inquiry = await getInquiryForUpdate(trx, payload.inquiryItemId);

    if (!inquiry) {
      throw new ActionError(404, '询价项不存在。');
    }

    await assertUserCanReadInquiry(trx, userId, inquiry);

    await trx('conversations').insert({
      id: randomUUID(),
      inquiry_item_id: inquiry.id,
      actor_id: userId,
      content: payload.content,
      metadata: JSON.stringify({ action: 'communicate' }),
      created_at: now,
    });
  });

  await notifyInquiryCounterparty(database, env, logger, inquiry, userId, '新的报价沟通记录', payload.content);

  return { inquiry_item_id: inquiry.id };
}

async function completeSupplierQuote(database, env, logger, req) {
  const userId = req.accountability?.user;

  if (!userId) {
    throw new ActionError(401, '请先登录后再完成报价。');
  }

  const payload = normalizePayload(req.body);

  if (!payload.inquiryItemId) {
    throw new ActionError(400, '缺少询价项。');
  }

  const now = new Date();
  let inquiryAfterUpdate = null;

  await database.transaction(async (trx) => {
    const inquiry = await getInquiryForUpdate(trx, payload.inquiryItemId);

    if (!inquiry) {
      throw new ActionError(404, '询价项不存在。');
    }

    await assertUserCanCompleteSupplierQuote(trx, userId, inquiry);

    const quoteCount = await trx('supplier_quotes')
      .where({ inquiry_item_id: inquiry.id })
      .count({ count: '*' })
      .first();

    if (Number(quoteCount?.count || 0) === 0) {
      throw new ActionError(400, '请先添加至少一条供应商报价，再完成报价。');
    }

    const inquiryPatch = {
      state: 'WaitingSalesReview',
      updated_at: now,
    };

    await trx('inquiry_items').where({ id: inquiry.id }).update(inquiryPatch);

    await trx('conversations').insert({
      id: randomUUID(),
      inquiry_item_id: inquiry.id,
      actor_id: userId,
      content: payload.changedFields.length > 0
        ? `采购已完成供应商报价，最近修改项：${payload.changedFields.join('、')}。等待外贸确认最终报价。`
        : '采购已完成供应商报价，等待外贸确认最终报价。',
      metadata: JSON.stringify({ action: 'complete_supplier_quote', changed_fields: payload.changedFields }),
      created_at: now,
    });

    inquiryAfterUpdate = {
      ...inquiry,
      ...inquiryPatch,
    };
  });

  await refreshTaskSummariesForInquiry(database, inquiryAfterUpdate);
  await notifyUser(database, env, logger, inquiryAfterUpdate.sales_owner_id, buildInquiryNotificationContent(inquiryAfterUpdate, '采购已完成报价', payload.changedFields.length > 0 ? `最近修改项：${payload.changedFields.join('、')}。请进入询价详情确认最终报价。` : '请进入询价详情确认最终报价。'));

  return {
    inquiry_item_id: inquiryAfterUpdate.id,
    state: inquiryAfterUpdate.state,
  };
}

async function markViewedAsAccepted(database, req) {
  const userId = req.accountability?.user;

  if (!userId) {
    throw new ActionError(401, '请先登录后再开始处理询价项。');
  }

  const payload = normalizePayload(req.body);

  if (!payload.inquiryItemId) {
    throw new ActionError(400, '缺少询价项。');
  }

  const now = new Date();
  let inquiryAfterUpdate = null;
  let accepted = false;

  await database.transaction(async (trx) => {
    const inquiry = await getInquiryForUpdate(trx, payload.inquiryItemId);

    if (!inquiry) {
      throw new ActionError(404, '询价项不存在。');
    }

    await assertUserCanMarkViewedAsAccepted(trx, userId, inquiry);

    if (inquiry.accepted_at || inquiry.state !== 'Assigned') {
      inquiryAfterUpdate = inquiry;
      return;
    }

    const inquiryPatch = {
      accepted_at: now,
      state: 'Purchasing',
      updated_at: now,
    };

    await trx('inquiry_items').where({ id: inquiry.id }).update(inquiryPatch);

    await trx('assignment_accept_tokens')
      .where({ inquiry_item_id: inquiry.id, buyer_id: userId })
      .whereNull('used_at')
      .update({ used_at: now });

    await trx('conversations').insert({
      id: randomUUID(),
      inquiry_item_id: inquiry.id,
      actor_id: userId,
      content: '采购员已在网页端打开询价详情，系统自动标记为开始处理。',
      metadata: JSON.stringify({ action: 'mark_viewed_as_accepted' }),
      created_at: now,
    });

    inquiryAfterUpdate = {
      ...inquiry,
      ...inquiryPatch,
    };

    accepted = true;
  });

  await refreshTaskSummariesForInquiry(database, inquiryAfterUpdate);

  return {
    accepted,
    inquiry_item_id: inquiryAfterUpdate.id,
    state: inquiryAfterUpdate.state,
  };
}

async function updateInquiry(database, env, logger, req) {
  const userId = req.accountability?.user;

  if (!userId) {
    throw new ActionError(401, '请先登录后再修改询价项。');
  }

  const payload = normalizeInquiryUpdatePayload(req.body);

  if (!payload.inquiryItemId || Object.keys(payload.patch).length === 0) {
    throw new ActionError(400, '缺少询价项或修改内容。');
  }

  const now = new Date();
  let inquiryAfterUpdate = null;
  let changedFieldDetails = [];
  let changedPatch = {};

  await database.transaction(async (trx) => {
    const inquiry = await getInquiryForUpdate(trx, payload.inquiryItemId);

    if (!inquiry) {
      throw new ActionError(404, '询价项不存在。');
    }

    await assertUserCanUpdateInquiry(trx, userId, inquiry);

    changedFieldDetails = getChangedFieldDetails(inquiry, payload.patch);

    if (changedFieldDetails.length === 0) {
      throw new ActionError(400, '询价项内容没有变化。');
    }

    changedPatch = Object.fromEntries(changedFieldDetails.map((detail) => [detail.field, payload.patch[detail.inputField]]));

    const patch = {
      ...changedPatch,
      state: 'Purchasing',
      updated_at: now,
    };

    await trx('inquiry_items').where({ id: inquiry.id }).update(patch);

    await trx('conversations').insert({
      id: randomUUID(),
      inquiry_item_id: inquiry.id,
      actor_id: userId,
      content: `外贸已修改询价项基础信息，修改项：${changedFieldDetails.map((detail) => detail.text).join('；')}。任务已退回采购再次报价。`,
      metadata: JSON.stringify({ action: 'update_inquiry', changed_fields: changedFieldDetails.map((detail) => detail.field), changed_field_details: changedFieldDetails.map((detail) => detail.text) }),
      created_at: now,
    });

    inquiryAfterUpdate = {
      ...inquiry,
      ...patch,
    };
  });

  await refreshTaskSummariesForInquiry(database, inquiryAfterUpdate);
  await notifyUser(database, env, logger, inquiryAfterUpdate.buyer_owner_id, buildInquiryNotificationContent(inquiryAfterUpdate, '外贸已修改询价项', `修改项：${changedFieldDetails.map((detail) => detail.text).join('；')}。请进入询价详情查看最新需求。`));

  return {
    inquiry_item_id: inquiryAfterUpdate.id,
    state: inquiryAfterUpdate.state,
    updated_fields: changedFieldDetails.map((detail) => detail.field),
  };
}

async function selectFinalQuote(database, req) {
  const userId = req.accountability?.user;

  if (!userId) {
    throw new ActionError(401, '请先登录后再确认最终报价。');
  }

  const payload = normalizeFinalQuotePayload(req.body);

  if (!payload.inquiryItemId || !payload.supplierQuoteId) {
    throw new ActionError(400, '缺少询价项或供应商报价。');
  }

  const now = new Date();
  let result = null;
  let inquiryAfterUpdate = null;

  await database.transaction(async (trx) => {
    const inquiry = await getInquiryForCustomerQuote(trx, payload.inquiryItemId);

    if (!inquiry) {
      throw new ActionError(404, '询价项不存在。');
    }

    await assertUserCanSelectFinalQuote(trx, userId, inquiry);

    const supplierQuote = await trx('supplier_quotes')
      .select('id', 'price', 'currency', 'lead_time', 'remark', 'attachment_ids')
      .where({ id: payload.supplierQuoteId, inquiry_item_id: inquiry.id })
      .first();

    if (!supplierQuote) {
      throw new ActionError(404, '供应商报价不存在。');
    }

    const approvalThreshold = await getApprovalThreshold(trx, inquiry.priority);
    const finalPriceSource = payload.price || supplierQuote.price;
    const finalCurrency = payload.currency || supplierQuote.currency || 'CNY';
    const finalLeadTime = payload.leadTime || supplierQuote.lead_time;
    const finalRemark = payload.remark || supplierQuote.remark;
    const quotePrice = Number(finalPriceSource);
    const needsApproval = Number.isFinite(approvalThreshold) && quotePrice > approvalThreshold;
    const approvalStatus = needsApproval ? 'Pending' : 'NotRequired';
    const nextState = needsApproval ? 'WaitingSalesReview' : 'Quoted';
    const existingCustomerQuote = await trx('customer_quotes')
      .select('id')
      .where({ inquiry_item_id: inquiry.id })
      .orderBy('quoted_at', 'desc')
      .first();
    const customerQuoteId = existingCustomerQuote?.id || randomUUID();
    const customerQuotePayload = {
      inquiry_item_id: inquiry.id,
      customer_id: inquiry.customer_id,
      price: quotePrice,
      currency: finalCurrency,
      lead_time: finalLeadTime,
      remark: finalRemark,
      attachment_ids: supplierQuote.attachment_ids,
      quoted_by: userId,
      quoted_at: now,
      approval_status: approvalStatus,
    };

    if (existingCustomerQuote) {
      await trx('customer_quotes').where({ id: customerQuoteId }).update(customerQuotePayload);
    } else {
      await trx('customer_quotes').insert({ id: customerQuoteId, ...customerQuotePayload });
    }

    let managerApprovalId = null;

    if (needsApproval) {
      const existingPendingApproval = await trx('manager_approvals')
        .select('id')
        .where({ customer_quote_id: customerQuoteId, status: 'Pending' })
        .first();

      managerApprovalId = existingPendingApproval?.id || randomUUID();

      const managerApprovalPayload = {
        inquiry_item_id: inquiry.id,
        customer_quote_id: customerQuoteId,
        requested_by: userId,
        status: 'Pending',
        reason: payload.approvalReason || `最终报价 ${quotePrice} ${finalCurrency} 超过审批阈值 ${approvalThreshold}。`,
      };

      if (existingPendingApproval) {
        await trx('manager_approvals').where({ id: managerApprovalId }).update(managerApprovalPayload);
      } else {
        await trx('manager_approvals').insert({ id: managerApprovalId, ...managerApprovalPayload, created_at: now });
      }
    }

    const inquiryPatch = {
      state: nextState,
      updated_at: now,
    };

    if (!needsApproval && !inquiry.completed_at) {
      inquiryPatch.completed_at = now;
    }

    await trx('inquiry_items').where({ id: inquiry.id }).update(inquiryPatch);

    await trx('conversations').insert({
      id: randomUUID(),
      inquiry_item_id: inquiry.id,
      actor_id: userId,
      content: buildFinalQuoteConversation({ ...supplierQuote, price: quotePrice, currency: finalCurrency, lead_time: finalLeadTime }, needsApproval, approvalThreshold),
      metadata: JSON.stringify({
        action: 'select_final_quote',
        supplier_quote_id: supplierQuote.id,
        customer_quote_id: customerQuoteId,
        manager_approval_id: managerApprovalId,
        approval_status: approvalStatus,
        approval_threshold: approvalThreshold,
      }),
      created_at: now,
    });

    inquiryAfterUpdate = { ...inquiry, ...inquiryPatch };
    result = {
      inquiry_item_id: inquiry.id,
      customer_quote_id: customerQuoteId,
      manager_approval_id: managerApprovalId,
      approval_required: needsApproval,
      approval_status: approvalStatus,
      state: nextState,
    };
  });

  await refreshTaskSummariesForInquiry(database, inquiryAfterUpdate);

  return result;
}

async function closeInquiry(database, req) {
  const userId = req.accountability?.user;

  if (!userId) {
    throw new ActionError(401, '请先登录后再结束询价。');
  }

  const payload = normalizeCloseInquiryPayload(req.body);

  if (!payload.inquiryItemId) {
    throw new ActionError(400, '缺少询价项。');
  }

  const now = new Date();
  let inquiryAfterUpdate = null;

  await database.transaction(async (trx) => {
    const inquiry = await getInquiryForUpdate(trx, payload.inquiryItemId);

    if (!inquiry) {
      throw new ActionError(404, '询价项不存在。');
    }

    await assertUserCanCloseInquiry(trx, userId, inquiry);

    const patch = {
      completed_at: inquiry.completed_at || now,
      state: 'Closed',
      updated_at: now,
    };

    await trx('inquiry_items').where({ id: inquiry.id }).update(patch);

    await trx('conversations').insert({
      id: randomUUID(),
      inquiry_item_id: inquiry.id,
      actor_id: userId,
      content: payload.reason ? `询价已结束。原因：${payload.reason}` : '询价已结束。',
      metadata: JSON.stringify({ action: 'close_inquiry', reason: payload.reason }),
      created_at: now,
    });

    inquiryAfterUpdate = { ...inquiry, ...patch };
  });

  await refreshTaskSummariesForInquiry(database, inquiryAfterUpdate);

  return {
    inquiry_item_id: inquiryAfterUpdate.id,
    state: inquiryAfterUpdate.state,
  };
}

async function submitCustomerQuote(database, env, logger, req) {
  const userId = req.accountability?.user;

  if (!userId) {
    throw new ActionError(401, '请先登录后再提交客户报价。');
  }

  const payload = normalizeCustomerQuotePayload(req.body);

  if (!payload.inquiryItemId || !payload.price || !payload.currency || !payload.leadTime) {
    throw new ActionError(400, '缺少询价项、销售价格、币种或货期。');
  }

  const now = new Date();
  let result = null;
  let inquiryAfterUpdate = null;

  await database.transaction(async (trx) => {
    const inquiry = await getInquiryForCustomerQuote(trx, payload.inquiryItemId);

    if (!inquiry) {
      throw new ActionError(404, '询价项不存在。');
    }

    await assertUserCanSubmitCustomerQuote(trx, userId, inquiry);

    const approvalThreshold = await getApprovalThreshold(trx, inquiry.priority);
    const quotePrice = Number(payload.price);
    const needsApproval = Number.isFinite(approvalThreshold) && quotePrice > approvalThreshold;
    const approvalStatus = needsApproval ? 'Pending' : 'NotRequired';
    const nextState = needsApproval ? 'WaitingSalesReview' : 'Quoted';
    const existingCustomerQuote = await trx('customer_quotes')
      .select('id')
      .where({ inquiry_item_id: inquiry.id })
      .orderBy('quoted_at', 'desc')
      .first();
    const customerQuoteId = existingCustomerQuote?.id || randomUUID();
    const customerQuotePayload = {
      inquiry_item_id: inquiry.id,
      customer_id: payload.customerId || inquiry.customer_id,
      price: quotePrice,
      currency: payload.currency,
      lead_time: payload.leadTime,
      remark: payload.remark,
      attachment_ids: payload.attachmentIds,
      quoted_by: userId,
      quoted_at: now,
      approval_status: approvalStatus,
    };

    if (existingCustomerQuote) {
      await trx('customer_quotes').where({ id: customerQuoteId }).update(customerQuotePayload);
    } else {
      await trx('customer_quotes').insert({ id: customerQuoteId, ...customerQuotePayload });
    }

    let managerApprovalId = null;

    if (needsApproval) {
      const existingPendingApproval = await trx('manager_approvals')
        .select('id')
        .where({ customer_quote_id: customerQuoteId, status: 'Pending' })
        .first();

      managerApprovalId = existingPendingApproval?.id || randomUUID();

      const managerApprovalPayload = {
        inquiry_item_id: inquiry.id,
        customer_quote_id: customerQuoteId,
        requested_by: userId,
        status: 'Pending',
        reason: payload.approvalReason || `客户报价 ${quotePrice} ${payload.currency} 超过审批阈值 ${approvalThreshold}。`,
      };

      if (existingPendingApproval) {
        await trx('manager_approvals').where({ id: managerApprovalId }).update(managerApprovalPayload);
      } else {
        await trx('manager_approvals').insert({ id: managerApprovalId, ...managerApprovalPayload, created_at: now });
      }
    }

    const inquiryPatch = {
      state: nextState,
      updated_at: now,
    };

    if (!needsApproval && !inquiry.completed_at) {
      inquiryPatch.completed_at = now;
    }

    await trx('inquiry_items').where({ id: inquiry.id }).update(inquiryPatch);

    await trx('conversations').insert({
      id: randomUUID(),
      inquiry_item_id: inquiry.id,
      actor_id: userId,
      content: buildCustomerQuoteConversation(payload, needsApproval, approvalThreshold),
      metadata: JSON.stringify({
        action: 'submit_customer_quote',
        customer_quote_id: customerQuoteId,
        manager_approval_id: managerApprovalId,
        approval_status: approvalStatus,
        approval_threshold: approvalThreshold,
      }),
      created_at: now,
    });

    inquiryAfterUpdate = { ...inquiry, ...inquiryPatch };
    result = {
      inquiry_item_id: inquiry.id,
      customer_quote_id: customerQuoteId,
      manager_approval_id: managerApprovalId,
      approval_required: needsApproval,
      approval_status: approvalStatus,
      state: nextState,
    };
  });

  await refreshTaskSummariesForInquiry(database, inquiryAfterUpdate);
  await notifyUser(database, env, logger, inquiryAfterUpdate.buyer_owner_id, buildInquiryNotificationContent(inquiryAfterUpdate, '外贸已提交最终报价', '请进入询价详情查看最新客户报价和要求。'));

  return result;
}

async function approveCustomerQuote(database, env, logger, req) {
  const userId = req.accountability?.user;

  if (!userId) {
    throw new ActionError(401, '请先登录后再审批客户报价。');
  }

  const payload = normalizeApprovalPayload(req.body);

  if (!payload.approvalId || !['Approved', 'Rejected'].includes(payload.decision)) {
    throw new ActionError(400, '缺少审批记录或审批结论不正确。');
  }

  const now = new Date();
  let result = null;
  let inquiryAfterUpdate = null;

  await database.transaction(async (trx) => {
    await assertUserIsManager(trx, userId);

    const approval = await getPendingApproval(trx, payload.approvalId);

    if (!approval) {
      throw new ActionError(404, '待审批记录不存在或已处理。');
    }

    const nextState = payload.decision === 'Approved' ? 'Quoted' : 'WaitingSalesReview';
    const quoteApprovalStatus = payload.decision === 'Approved' ? 'Approved' : 'Rejected';

    await trx('manager_approvals')
      .where({ id: approval.id })
      .update({
        approved_by: userId,
        status: payload.decision,
        reason: payload.reason || approval.reason,
        approved_at: now,
      });

    await trx('customer_quotes')
      .where({ id: approval.customer_quote_id })
      .update({ approval_status: quoteApprovalStatus });

    const inquiryPatch = {
      state: nextState,
      updated_at: now,
    };

    if (payload.decision === 'Approved' && !approval.completed_at) {
      inquiryPatch.completed_at = now;
    }

    await trx('inquiry_items').where({ id: approval.inquiry_item_id }).update(inquiryPatch);

    await trx('conversations').insert({
      id: randomUUID(),
      inquiry_item_id: approval.inquiry_item_id,
      actor_id: userId,
      content: buildApprovalConversation(payload),
      metadata: JSON.stringify({
        action: 'approve_customer_quote',
        manager_approval_id: approval.id,
        customer_quote_id: approval.customer_quote_id,
        decision: payload.decision,
      }),
      created_at: now,
    });

    inquiryAfterUpdate = { ...approval, ...inquiryPatch, id: approval.inquiry_item_id };
    result = {
      inquiry_item_id: approval.inquiry_item_id,
      customer_quote_id: approval.customer_quote_id,
      manager_approval_id: approval.id,
      approval_status: quoteApprovalStatus,
      state: nextState,
    };
  });

  await refreshTaskSummariesForInquiry(database, inquiryAfterUpdate);

  await notifyUser(
    database,
    env,
    logger,
    inquiryAfterUpdate.sales_owner_id,
    buildInquiryNotificationContent(inquiryAfterUpdate, payload.decision === 'Approved' ? '最终报价审批已通过' : '最终报价审批已拒绝', payload.reason || (payload.decision === 'Approved' ? '询价已完成。' : '请修改最终报价后再次提交审批。')),
  );

  return result;
}

function normalizePayload(body) {
  const source = body && typeof body === 'object' ? body : {};

  return {
    changedFields: Array.isArray(source.changed_fields) ? source.changed_fields.map(stringOrEmpty).filter(Boolean) : [],
    inquiryItemId: stringOrEmpty(source.inquiry_item_id),
    content: stringOrEmpty(source.content),
    nextState: stringOrEmpty(source.next_state),
  };
}

function normalizeInquiryUpdatePayload(body) {
  const source = body && typeof body === 'object' ? body : {};
  const patch = pickDefined({
    customer_id: nullableString(source.customer_id),
    project_name: nullableString(source.project_name),
    product_name: stringOrEmpty(source.product_name),
    brand: nullableString(source.brand),
    model: nullableString(source.model),
    specification: nullableString(source.specification),
    quantity: nullableNumber(source.quantity),
    unit: nullableString(source.unit),
    target_price: nullableNumber(source.target_price),
    priority: stringOrEmpty(source.priority),
    remark: nullableString(source.remark),
    tags: nullableString(source.tags),
  });

  if (!patch.product_name) {
    delete patch.product_name;
  }

  if (patch.priority && !['Low', 'Normal', 'High', 'Urgent'].includes(patch.priority)) {
    delete patch.priority;
  }

  return {
    inquiryItemId: stringOrEmpty(source.inquiry_item_id),
    patch,
  };
}

function normalizeFinalQuotePayload(body) {
  const source = body && typeof body === 'object' ? body : {};

  return {
    inquiryItemId: stringOrEmpty(source.inquiry_item_id),
    supplierQuoteId: stringOrEmpty(source.supplier_quote_id),
    price: stringOrEmpty(source.price),
    currency: stringOrEmpty(source.currency),
    leadTime: stringOrEmpty(source.lead_time),
    remark: nullableString(source.remark),
    approvalReason: nullableString(source.approval_reason),
  };
}

function normalizeCloseInquiryPayload(body) {
  const source = body && typeof body === 'object' ? body : {};

  return {
    inquiryItemId: stringOrEmpty(source.inquiry_item_id),
    reason: nullableString(source.reason),
  };
}

function normalizeCustomerQuotePayload(body) {
  const source = body && typeof body === 'object' ? body : {};

  return {
    inquiryItemId: stringOrEmpty(source.inquiry_item_id),
    customerId: stringOrEmpty(source.customer_id),
    price: stringOrEmpty(source.price),
    currency: stringOrEmpty(source.currency),
    leadTime: stringOrEmpty(source.lead_time),
    remark: stringOrEmpty(source.remark),
    approvalReason: stringOrEmpty(source.approval_reason),
    attachmentIds: source.attachment_ids === undefined ? null : source.attachment_ids,
  };
}

function normalizeApprovalPayload(body) {
  const source = body && typeof body === 'object' ? body : {};

  return {
    approvalId: stringOrEmpty(source.approval_id),
    decision: stringOrEmpty(source.decision),
    reason: stringOrEmpty(source.reason),
  };
}

async function getInquiryForUpdate(database, inquiryItemId) {
  return database('inquiry_items')
    .select(
      'id',
      'inquiry_no',
      'customer_id',
      'project_name',
      'product_name',
      'brand',
      'model',
      'specification',
      'quantity',
      'unit',
      'target_price',
      'priority',
      'remark',
      'tags',
      'state',
      'sales_owner_id',
      'buyer_owner_id',
      'accepted_at',
      'completed_at',
    )
    .where({ id: inquiryItemId })
    .first();
}

async function getInquiryForCustomerQuote(database, inquiryItemId) {
  return database('inquiry_items')
    .select('id', 'inquiry_no', 'product_name', 'brand', 'customer_id', 'priority', 'state', 'sales_owner_id', 'buyer_owner_id', 'completed_at')
    .where({ id: inquiryItemId })
    .first();
}

async function getApprovalThreshold(database, priority) {
  const rule = await database('priority_rules')
    .select('approval_threshold')
    .where({ priority: priority || 'Normal' })
    .first();

  const threshold = Number(rule?.approval_threshold);
  return Number.isFinite(threshold) && threshold > 0 ? threshold : null;
}

async function getPendingApproval(database, approvalId) {
  return database('manager_approvals')
    .leftJoin('inquiry_items', 'manager_approvals.inquiry_item_id', 'inquiry_items.id')
    .select(
      'manager_approvals.id',
      'manager_approvals.inquiry_item_id',
      'manager_approvals.customer_quote_id',
      'manager_approvals.reason',
      'inquiry_items.id as inquiry_id',
      'inquiry_items.inquiry_no',
      'inquiry_items.product_name',
      'inquiry_items.brand',
      'inquiry_items.sales_owner_id',
      'inquiry_items.buyer_owner_id',
      'inquiry_items.completed_at',
    )
    .where('manager_approvals.id', approvalId)
    .where('manager_approvals.status', 'Pending')
    .first();
}

async function getInquiryForSimilarQuotes(database, inquiryItemId) {
  return database('inquiry_items')
    .select(
      'id',
      'inquiry_no',
      'product_name',
      'brand',
      'model',
      'tags',
      'sales_owner_id',
      'buyer_owner_id',
      'state',
    )
    .where({ id: inquiryItemId })
    .first();
}

async function getSimilarQuoteCandidates(database, inquiryItemId, candidateLimit) {
  return database('supplier_quotes')
    .leftJoin('inquiry_items', 'supplier_quotes.inquiry_item_id', 'inquiry_items.id')
    .leftJoin('suppliers', 'supplier_quotes.supplier_id', 'suppliers.id')
    .select(
      'inquiry_items.id as inquiry_item_id',
      'inquiry_items.inquiry_no',
      'inquiry_items.product_name',
      'inquiry_items.brand',
      'inquiry_items.model',
      'inquiry_items.tags',
      'inquiry_items.completed_at',
      'supplier_quotes.id as supplier_quote_id',
      'supplier_quotes.supplier_id',
      'suppliers.supplier_name',
      'supplier_quotes.price',
      'supplier_quotes.currency',
      'supplier_quotes.lead_time',
      'supplier_quotes.inquiry_price',
      'supplier_quotes.inquiry_coef',
      'supplier_quotes.remark',
      'supplier_quotes.quoted_at',
      'supplier_quotes.is_recommended',
    )
    .whereNot('inquiry_items.id', inquiryItemId)
    .whereIn('inquiry_items.state', ['Quoted', 'Closed'])
    .whereNotNull('supplier_quotes.price')
    .orderBy('supplier_quotes.quoted_at', 'desc')
    .limit(candidateLimit);
}

async function assertUserCanReadInquiry(database, userId, inquiry) {
  const roleScope = await getUserTaskRoleScope(database, userId);
  const userIdText = String(userId);

  if (roleScope === 'Manager') {
    return;
  }

  if (roleScope === 'Sales' && String(inquiry.sales_owner_id || '') === userIdText) {
    return;
  }

  if (roleScope === 'Buyer' && String(inquiry.buyer_owner_id || '') === userIdText) {
    return;
  }

  throw new ActionError(403, '你没有权限查看该询价项的历史类似报价。');
}

async function assertUserCanMarkViewedAsAccepted(database, userId, inquiry) {
  const roleScope = await getUserTaskRoleScope(database, userId);

  if (roleScope !== 'Buyer' || String(inquiry.buyer_owner_id || '') !== String(userId)) {
    throw new ActionError(403, '只有当前采购负责人可以开始处理该询价项。');
  }

  if (finishedStates.has(inquiry.state)) {
    throw new ActionError(400, '已完成的询价项不能重新开始处理。');
  }
}

async function assertUserCanCompleteSupplierQuote(database, userId, inquiry) {
  const roleScope = await getUserTaskRoleScope(database, userId);

  if (roleScope !== 'Buyer' || String(inquiry.buyer_owner_id || '') !== String(userId)) {
    throw new ActionError(403, '只有当前采购负责人可以完成报价。');
  }

  if (inquiry.state !== 'Purchasing') {
    throw new ActionError(400, '只有采购处理中状态的询价项可以完成报价。');
  }
}

async function assertUserCanUpdateInquiry(database, userId, inquiry) {
  const roleScope = await getUserTaskRoleScope(database, userId);

  if (roleScope !== 'Sales' || String(inquiry.sales_owner_id || '') !== String(userId)) {
    throw new ActionError(403, '只有发起该询价项的外贸员可以修改。');
  }

  if (finishedStates.has(inquiry.state)) {
    throw new ActionError(400, '最终报价完成后不能再修改询价项。');
  }
}

async function assertUserCanSelectFinalQuote(database, userId, inquiry) {
  const roleScope = await getUserTaskRoleScope(database, userId);

  if (roleScope !== 'Sales' || String(inquiry.sales_owner_id || '') !== String(userId)) {
    throw new ActionError(403, '只有发起该询价项的外贸员可以确认最终报价。');
  }

  if (inquiry.state !== 'WaitingSalesReview') {
    throw new ActionError(400, '只有待外贸确认状态的询价项可以确认最终报价。');
  }
}

async function assertUserCanCloseInquiry(database, userId, inquiry) {
  const roleScope = await getUserTaskRoleScope(database, userId);
  const userIdText = String(userId);
  const isSalesOwner = String(inquiry.sales_owner_id || '') === userIdText;

  if (roleScope === 'Manager' || (roleScope === 'Sales' && isSalesOwner)) {
    return;
  }

  throw new ActionError(403, '只有发起外贸员或经理可以结束询价。');
}

async function assertUserCanSubmitCustomerQuote(database, userId, inquiry) {
  const roleScope = await getUserTaskRoleScope(database, userId);

  if (roleScope !== 'Sales' || String(inquiry.sales_owner_id || '') !== String(userId)) {
    throw new ActionError(403, '只有该询价项外贸负责人可以提交客户报价。');
  }

  if (inquiry.state !== 'WaitingSalesReview') {
    throw new ActionError(400, '只有待外贸复核状态的询价项可以提交客户报价。');
  }
}

async function assertUserIsManager(database, userId) {
  const roleScope = await getUserTaskRoleScope(database, userId);

  if (roleScope !== 'Manager') {
    throw new ActionError(403, '只有经理可以审批客户报价。');
  }
}

function scoreSimilarQuote(inquiry, candidate) {
  const matchedReasons = [];
  let score = 0;

  if (sameNormalizedText(inquiry.brand, candidate.brand)) {
    score += 500;
    matchedReasons.push('品牌一致');
  }

  if (sameNormalizedText(inquiry.model, candidate.model)) {
    score += 400;
    matchedReasons.push('型号一致');
  }

  const productScore = calculateProductNameScore(inquiry.product_name, candidate.product_name);

  if (productScore > 0) {
    score += productScore;
    matchedReasons.push('产品名称相似');
  }

  const tagMatches = getTagMatches(inquiry.tags, candidate.tags);

  if (tagMatches.length > 0) {
    score += Math.min(150, tagMatches.length * 50);
    matchedReasons.push(`标签匹配：${tagMatches.join('、')}`);
  }

  if (candidate.is_recommended) {
    score += 80;
    matchedReasons.push('历史推荐报价');
  }

  const recencyScore = calculateRecencyScore(candidate.quoted_at || candidate.completed_at);

  if (recencyScore > 0) {
    score += recencyScore;
    matchedReasons.push('报价时间较近');
  }

  return {
    inquiry_item_id: candidate.inquiry_item_id,
    inquiry_no: candidate.inquiry_no,
    product_name: candidate.product_name,
    brand: candidate.brand,
    model: candidate.model,
    supplier_quote_id: candidate.supplier_quote_id,
    supplier_id: candidate.supplier_id,
    supplier_name: candidate.supplier_name,
    price: candidate.price,
    currency: candidate.currency,
    lead_time: candidate.lead_time,
    inquiry_price: candidate.inquiry_price,
    inquiry_coef: candidate.inquiry_coef,
    remark: candidate.remark,
    quoted_at: candidate.quoted_at,
    completed_at: candidate.completed_at,
    is_recommended: Boolean(candidate.is_recommended),
    score,
    matched_reasons: matchedReasons,
  };
}

function buildCustomerQuoteConversation(payload, needsApproval, approvalThreshold) {
  const lines = [
    `已提交客户报价：${payload.price} ${payload.currency}。`,
    `货期：${payload.leadTime}`,
  ];

  if (payload.remark) {
    lines.push(`备注：${payload.remark}`);
  }

  if (needsApproval) {
    lines.push(`报价超过审批阈值 ${approvalThreshold}，已提交经理审批。`);
  } else {
    lines.push('报价未超过审批阈值，已完成报价。');
  }

  return lines.join('\n');
}

function buildFinalQuoteConversation(supplierQuote, needsApproval, approvalThreshold) {
  const lines = [
    `已选择最终报价：${supplierQuote.price} ${supplierQuote.currency || 'CNY'}。`,
  ];

  if (supplierQuote.lead_time) {
    lines.push(`货期：${supplierQuote.lead_time}`);
  }

  if (needsApproval) {
    lines.push(`最终报价超过审批阈值 ${approvalThreshold}，已提交经理审批。`);
  } else {
    lines.push('最终报价未超过审批阈值，询价已形成最终报价。');
  }

  return lines.join('\n');
}

function getChangedFieldLabels(fields) {
  const labels = {
    brand: '品牌',
    customer_id: '客户',
    model: '型号',
    priority: '优先级',
    product_name: '产品名称',
    project_name: '项目',
    quantity: '数量',
    remark: '备注',
    specification: '规格',
    tags: '标签',
    target_price: '目标价格',
    unit: '单位',
  };

  return fields.map((field) => labels[field] || field);
}

function getChangedFieldDetails(previous, patch) {
  const fieldMap = {
    brand: { label: '品牌', source: 'brand' },
    customer_id: { label: '客户', source: 'customer_id' },
    customerId: { label: '客户', source: 'customer_id' },
    model: { label: '型号', source: 'model' },
    priority: { label: '优先级', source: 'priority' },
    product_name: { label: '产品名称', source: 'product_name' },
    productName: { label: '产品名称', source: 'product_name' },
    project_name: { label: '项目', source: 'project_name' },
    projectName: { label: '项目', source: 'project_name' },
    quantity: { label: '数量', source: 'quantity' },
    remark: { label: '备注', source: 'remark' },
    specification: { label: '规格', source: 'specification' },
    tags: { label: '标签', source: 'tags' },
    target_price: { label: '目标价格', source: 'target_price' },
    targetPrice: { label: '目标价格', source: 'target_price' },
    unit: { label: '单位', source: 'unit' },
  };

  return Object.entries(patch).flatMap(([field, newValue]) => {
    const config = fieldMap[field] || { label: field, source: field };
    const oldValue = previous[config.source];

    if (normalizeChangedValue(oldValue) === normalizeChangedValue(newValue)) {
      return [];
    }

    return [{
      field: config.source,
      inputField: field,
      text: `${config.label}：${formatChangedValue(oldValue)} -> ${formatChangedValue(newValue)}`,
    }];
  });
}

function normalizeChangedValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).join(',');

  return String(value).trim();
}

function formatChangedValue(value) {
  const normalizedValue = normalizeChangedValue(value);

  return normalizedValue || '空';
}

function buildApprovalConversation(payload) {
  const decisionText = payload.decision === 'Approved' ? '审批通过' : '审批拒绝';
  const lines = [`客户报价${decisionText}。`];

  if (payload.reason) {
    lines.push(`原因：${payload.reason}`);
  }

  return lines.join('\n');
}

async function notifyInquiryCounterparty(database, env, logger, inquiry, actorId, title, detail) {
  const actorIdText = String(actorId);
  let receiverId = null;

  if (String(inquiry.buyer_owner_id || '') === actorIdText) {
    receiverId = inquiry.sales_owner_id;
  } else if (String(inquiry.sales_owner_id || '') === actorIdText) {
    receiverId = inquiry.buyer_owner_id;
  }

  if (!receiverId) {
    return;
  }

  await notifyUser(database, env, logger, receiverId, buildInquiryNotificationContent(inquiry, title, detail));
}

function buildInquiryNotificationContent(inquiry, title, detail) {
  return [
    `**${title}**`,
    `询价编号：${inquiry.inquiry_no || inquiry.id}`,
    `产品：${inquiry.product_name || '-'}`,
    `品牌：${inquiry.brand || '-'}`,
    detail ? `内容：${detail}` : '',
  ].filter(Boolean).join('\n');
}

async function notifyUser(database, env, logger, userId, content) {
  if (!userId) {
    return;
  }

  const mention = await getWechatMention(database, userId);
  const message = [mention, content].filter(Boolean).join('\n');

  if (!env.WECHAT_WORK_WEBHOOK_URL) {
    logger?.info?.(message);
    return;
  }

  try {
    const response = await fetch(env.WECHAT_WORK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'markdown', markdown: { content: message } }),
    });

    if (!response.ok) {
      logger?.warn?.(`企业微信通知失败：${response.status} ${response.statusText}`);
    }
  } catch (error) {
    logger?.warn?.(`企业微信通知异常：${error.message}`);
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

function assertTransitionAllowed(currentState, nextState) {
  const normalizedCurrentState = stringOrEmpty(currentState);
  const allowedNextStates = allowedTransitions.get(normalizedCurrentState);

  if (!allowedNextStates?.has(nextState)) {
    throw new ActionError(400, `不允许从 ${normalizedCurrentState || '空状态'} 切换到 ${nextState}。`);
  }
}

async function assertUserCanTransition(database, userId, inquiry, nextState) {
  const roleScope = await getUserTaskRoleScope(database, userId);
  const userIdText = String(userId);
  const isSalesOwner = String(inquiry.sales_owner_id || '') === userIdText;
  const isBuyerOwner = String(inquiry.buyer_owner_id || '') === userIdText;

  if (roleScope === 'Manager') {
    return;
  }

  if (inquiry.state === 'Purchasing' && nextState === 'WaitingSalesReview' && roleScope === 'Buyer' && isBuyerOwner) {
    return;
  }

  if (inquiry.state === 'WaitingSalesReview' && roleScope === 'Sales' && isSalesOwner) {
    return;
  }

  if (inquiry.state === 'Quoted' && nextState === 'Closed' && roleScope === 'Sales' && isSalesOwner) {
    return;
  }

  throw new ActionError(403, '你没有权限执行该状态切换。');
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

function calculateProductNameScore(left, right) {
  const leftTokens = tokenizeText(left);
  const rightTokens = tokenizeText(right);

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }

  const matchedCount = leftTokens.filter((token) => rightTokens.includes(token)).length;

  if (matchedCount === 0) {
    return 0;
  }

  return Math.min(200, matchedCount * 80);
}

function getTagMatches(left, right) {
  const leftTags = splitCsv(left);
  const rightTags = splitCsv(right);

  return leftTags.filter((tag) => rightTags.includes(tag));
}

function calculateRecencyScore(value) {
  const timestamp = new Date(value || 0).getTime();

  if (!timestamp) {
    return 0;
  }

  const ageDays = Math.max(0, (Date.now() - timestamp) / 86_400_000);

  if (ageDays <= 30) {
    return 100;
  }

  if (ageDays <= 90) {
    return 70;
  }

  if (ageDays <= 180) {
    return 40;
  }

  if (ageDays <= 365) {
    return 20;
  }

  return 0;
}

function sameNormalizedText(left, right) {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);

  return normalizedLeft !== '' && normalizedLeft === normalizedRight;
}

function tokenizeText(value) {
  return normalizeText(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2);
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

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.floor(value)));
}

function stringOrEmpty(value) {
  return String(value || '').trim();
}

function nullableString(value) {
  if (value === null) {
    return null;
  }

  const text = stringOrEmpty(value);
  return text || null;
}

function nullableNumber(value) {
  if (value === null || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function pickDefined(source) {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined));
}

function sendError(res, status, message) {
  return res.status(status).json({
    errors: [
      {
        message,
        extensions: { code: 'PURCHASE_FLOW_ACTION_ERROR' },
      },
    ],
  });
}

class ActionError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
