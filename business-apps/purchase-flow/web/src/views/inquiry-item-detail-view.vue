<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { commentAndUpdateState, get询价项Detail } from '../api/purchase-flow';
import AppShell from '../components/app-shell.vue';
import ConversationPanel from '../components/conversation-panel.vue';
import InquiryItemKeyInfo from '../components/inquiry-item-key-info.vue';
import QuoteSummaryTable from '../components/quote-summary-table.vue';
import { useAuthStore } from '../stores/auth';
import type { InquiryItemDetail, InquiryState } from '../types/purchase-flow';

const route = useRoute();
const auth = useAuthStore();
const item = ref<InquiryItemDetail | null>(null);
const loading = ref(true);
const submitting = ref(false);
const error = ref('');

const requestController = new AbortController();
let activeRequest = 0;

function trackRequest(): AbortSignal {
	activeRequest += 1;
	return requestController.signal;
}

async function load(signal?: AbortSignal) {
	loading.value = true;
	error.value = '';

	try {
		item.value = await get询价项Detail(String(route.params.id), signal);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '询价项详情加载失败';
	} finally {
		loading.value = false;
	}
}

async function submitConversation(payload: { content: string; state: InquiryState | null }) {
	if (!auth.currentUser?.id) {
		error.value = '无法识别当前用户，请重新登录。';
		return;
	}

	submitting.value = true;

	try {
		await commentAndUpdateState(
			{
				actor_id: auth.currentUser.id,
				content: payload.content,
				inquiry_item_id: String(route.params.id),
				state: payload.state,
			},
			requestController.signal,
		);

		await load(requestController.signal);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '提交沟通失败';
	} finally {
		submitting.value = false;
	}
}

onMounted(() => {
	const signal = trackRequest();
	load(signal);
});

onUnmounted(() => {
	requestController.abort();
});
</script>

<template>
	<AppShell>
		<section class="section-header">
			<div>
				<p class="eyebrow">Detail</p>
				<h2>询价项完整详情</h2>
			</div>
			<RouterLink class="text-link" to="/inquiry-items">返回列表</RouterLink>
		</section>
		<p v-if="loading" class="state-card" role="status" aria-live="polite" aria-busy="true">正在加载详情...</p>
		<p v-else-if="error" class="state-card error" role="status" aria-live="polite">{{ error }}</p>
		<div v-else-if="item" class="detail-grid">
			<InquiryItemKeyInfo :item="item" />
			<section class="info-card">
				<h3>供应商报价全部内容</h3>
				<QuoteSummaryTable :quotes="item.supplier_quotes" />
			</section>
			<section class="info-card">
				<h3>客户报价全部内容</h3>
				<table v-if="item.customer_quotes.length">
					<thead>
						<tr>
							<th scope="col">报价</th>
							<th scope="col">报价时间</th>
							<th scope="col">备注</th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="quote in item.customer_quotes" :key="quote.id || quote.quoted_at || String(quote.price)">
							<td>{{ quote.price || '-' }} {{ quote.currency || '' }}</td>
							<td>{{ quote.quoted_at || '-' }}</td>
							<td>{{ quote.remark || '-' }}</td>
						</tr>
					</tbody>
				</table>
				<p v-else class="muted">暂无客户报价。</p>
			</section>
			<ConversationPanel :conversations="item.conversations" :submitting="submitting" @submit="submitConversation" />
		</div>
	</AppShell>
</template>
