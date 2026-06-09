import { createHash, timingSafeEqual } from 'node:crypto';

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
    .select('id', 'buyer_owner_id', 'accepted_at', 'state')
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

function redirectToInquiry(res, env, inquiryItemId) {
  const purchaseAppUrl = env.PUBLIC_PURCHASE_APP_URL || env.PUBLIC_APP_URL || 'http://localhost:5173';
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
