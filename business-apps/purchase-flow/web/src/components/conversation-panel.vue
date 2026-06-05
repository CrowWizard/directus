<template>
	<section class="info-card">
		<h3>报价沟通记录</h3>
		<ul v-if="conversations.length" class="conversation-list">
			<li v-for="conversation in conversations" :key="conversation.id || conversation.created_at || conversation.content">
				<p>{{ conversation.content }}</p>
				<small>{{ conversation.created_at || '-' }}</small>
			</li>
		</ul>
		<p v-else class="muted">暂无沟通记录。</p>

		<form class="conversation-form" data-test="conversation-form" @submit.prevent="submit">
			<h4>新增沟通表单</h4>
			<label>
				沟通内容
				<textarea v-model="content" name="content" rows="4" required />
			</label>
			<label>
				状态动作
				<select v-model="stateAction" name="state_action">
					<option v-for="action in stateActions" :key="action.label" :value="action.value || ''">{{ action.label }}</option>
				</select>
			</label>
			<p class="muted">当前后端由前端串联两次请求完成沟通和状态更新，后续会补原子接口。</p>
			<button type="submit" :disabled="submitting">{{ submitting ? '提交中...' : '提交沟通' }}</button>
		</form>
	</section>
</template>

<script setup lang="ts">
import { ref } from 'vue';

import type { Conversation, InquiryState } from '../types/purchase-flow';

defineProps<{ conversations: Conversation[]; submitting: boolean }>();

const emit = defineEmits<{
	submit: [payload: { content: string; state: InquiryState | null }];
}>();

const stateActions: Array<{ label: string; value: InquiryState | null }> = [
	{ label: '仅沟通', value: null },
	{ label: '补充报价信息，任务交给外贸员', value: 'WaitingSalesReview' },
	{ label: '再次报价，任务交给采购员', value: 'Purchasing' },
];

const content = ref('');
const stateAction = ref<InquiryState | ''>('');

function submit() {
	emit('submit', { content: content.value, state: stateAction.value || null });
	content.value = '';
	stateAction.value = '';
}
</script>
