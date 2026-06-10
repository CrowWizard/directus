<script setup lang="ts">
import { computed } from 'vue';
import type { InquiryItem } from '../types/purchase-flow';
import { getStateLabel, inquiryStateNextActions } from '../utils/inquiry-state';

type OwnerUser = InquiryItem['sales_owner_id'] | InquiryItem['buyer_owner_id'];

const props = defineProps<{ compact?: boolean; item?: InquiryItem; state: string }>();

function userName(user: OwnerUser) {
	if (!user) return '-';
	if (typeof user === 'string') return user;

	return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || user.id;
}

function getOwner(item: InquiryItem | undefined, state: string) {
	if (!item) return '-';
	if (state === 'Draft' || state === 'WaitingSalesReview' || state === 'Quoted') return userName(item.sales_owner_id);
	if (state === 'Assigned' || state === 'Purchasing') return userName(item.buyer_owner_id);

	return userName(item.sales_owner_id) || userName(item.buyer_owner_id);
}

function isOverdue(deadline?: string | null) {
	if (!deadline) return false;

	return new Date(deadline).getTime() < Date.now();
}

const label = computed(() => getStateLabel(props.state));
const owner = computed(() => getOwner(props.item, props.state));
const nextAction = computed(() => inquiryStateNextActions[props.state] || '-');
const overdue = computed(() => isOverdue(props.item?.assignment_deadline) && !['Quoted', 'Closed'].includes(props.state));
const tone = computed(() => {
	if (overdue.value) return 'danger';
	if (props.state === 'WaitingSalesReview' || props.state === 'Assigned') return 'warning';
	if (props.state === 'Quoted' || props.state === 'Closed') return 'neutral';

	return 'accent';
});
</script>

<template>
	<div class="task-progress" :class="{ 'is-compact': compact, 'is-overdue': overdue }" :data-state="state" :data-tone="tone">
		<span class="status-pill" :class="`status-pill--${tone}`">{{ label }}</span>
		<dl v-if="item && !compact" class="task-progress__meta">
			<div>
				<dt>当前责任人</dt>
				<dd>{{ owner }}</dd>
			</div>
			<div>
				<dt>下一步动作</dt>
				<dd>{{ nextAction }}</dd>
			</div>
			<div>
				<dt>超时状态</dt>
				<dd>{{ overdue ? '已超时' : '未超时' }}</dd>
			</div>
		</dl>
	</div>
</template>
