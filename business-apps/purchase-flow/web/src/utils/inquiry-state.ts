export const inquiryStateLabels: Record<string, string> = {
	Draft: '草稿',
	Assigned: '待接单',
	Purchasing: '采购中',
	WaitingSalesReview: '待外贸确认',
	Quoted: '已报价',
	Closed: '已关闭',
};

export const inquiryStateNextActions: Record<string, string> = {
	Draft: '提交询价并分配采购员',
	Assigned: '采购员接单',
	Purchasing: '补充供应商报价',
	WaitingSalesReview: '外贸员确认最终报价',
	Quoted: '客户确认后关闭',
	Closed: '流程已结束',
};

export function getStateLabel(state?: string | null) {
	if (!state) return '-';

	return inquiryStateLabels[state] || state;
}
