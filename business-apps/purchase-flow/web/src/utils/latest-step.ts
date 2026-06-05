import type { Conversation, CustomerQuote, InquiryItem, SupplierQuote } from '../types/purchase-flow';

export type LatestStep = {
	title: string;
	detail: string;
	at: string | null;
	ownerScope: 'Sales' | 'Buyer' | 'Manager' | null;
};

type LatestStepInput = {
	询价项: Pick<InquiryItem, 'accepted_at' | 'id' | 'state' | 'updated_at'>;
	conversations: Conversation[];
	supplierQuotes: SupplierQuote[];
	customerQuotes: CustomerQuote[];
};

type Candidate = LatestStep & { score: number };

function timeScore(value?: string | null) {
	if (!value) return 0;

	const score = new Date(value).getTime();

	return Number.isNaN(score) ? 0 : score;
}

function quoteDetail(price?: string | number | null, currency?: string | null) {
	if (price === undefined || price === null || price === '') return '已记录报价，等待进一步确认。';

	return `报价 ${price}${currency ? ` ${currency}` : ''}`;
}

function stateFallback(询价项: LatestStepInput['询价项']): LatestStep {
	if (询价项.state === 'Assigned') {
		return { title: '等待接单', detail: '等待采购员接单', at: 询价项.updated_at || null, ownerScope: 'Buyer' };
	}

	if (询价项.state === 'Purchasing') {
		return { title: '采购处理中', detail: '采购处理中', at: 询价项.updated_at || null, ownerScope: 'Buyer' };
	}

	if (询价项.state === 'WaitingSalesReview') {
		return {
			title: '等待外贸处理',
			detail: '等待外贸补充报价信息',
			at: 询价项.updated_at || null,
			ownerScope: 'Sales',
		};
	}

	return { title: '状态更新', detail: `当前状态：${询价项.state}`, at: 询价项.updated_at || null, ownerScope: null };
}

export function getLatestStep(input: LatestStepInput): LatestStep {
	const candidates: Candidate[] = [];

	for (const conversation of input.conversations) {
		candidates.push({
			title: '最新沟通',
			detail: conversation.content,
			at: conversation.created_at || null,
			ownerScope: null,
			score: timeScore(conversation.created_at),
		});
	}

	for (const quote of input.supplierQuotes) {
		candidates.push({
			title: '最新供应商报价',
			detail: quoteDetail(quote.price, quote.currency),
			at: quote.quoted_at || null,
			ownerScope: 'Buyer',
			score: timeScore(quote.quoted_at),
		});
	}

	for (const quote of input.customerQuotes) {
		candidates.push({
			title: '最新客户报价',
			detail: quoteDetail(quote.price, quote.currency),
			at: quote.quoted_at || null,
			ownerScope: 'Sales',
			score: timeScore(quote.quoted_at),
		});
	}

	if (input.询价项.accepted_at) {
		candidates.push({
			title: '采购员已接单',
			detail: '采购员已接单并开始处理报价。',
			at: input.询价项.accepted_at,
			ownerScope: 'Buyer',
			score: timeScore(input.询价项.accepted_at),
		});
	}

	candidates.sort((left, right) => right.score - left.score);

	const latest = candidates[0];

	if (latest && latest.score > 0) {
		const { score: _score, ...step } = latest;

		return step;
	}

	return stateFallback(input.询价项);
}
