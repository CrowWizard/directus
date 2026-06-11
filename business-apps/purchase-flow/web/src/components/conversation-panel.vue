<script setup lang="ts">
import { computed, ref } from 'vue';
import type { RoleScope } from '../stores/auth';
import type { Conversation, InquiryState } from '../types/purchase-flow';

const props = defineProps<{ conversations: Conversation[]; disabled?: boolean; submitting: boolean; roleScope: RoleScope }>();

const emit = defineEmits<{
	submit: [payload: { content: string; state: InquiryState | null }];
}>();

const stateActions: Array<{ label: string; value: InquiryState | null; hiddenFor?: RoleScope }> = [
	{ label: '仅沟通', value: null },
	{ label: '交给外贸员补充报价信息', value: 'WaitingSalesReview', hiddenFor: 'Sales' },
	{ label: '交给采购员再次报价', value: 'Purchasing', hiddenFor: 'Buyer' },
];

const availableStateActions = computed(() => stateActions.filter((action) => action.hiddenFor !== props.roleScope));

const content = ref('');
const stateAction = ref<InquiryState | ''>('');

function submit() {
	if (props.disabled) return;

	emit('submit', { content: content.value, state: stateAction.value || null });
	content.value = '';
	stateAction.value = '';
}
</script>

<template>
	<section class="info-card">
		<h3>报价沟通记录</h3>
		<ul v-if="conversations.length" class="conversation-list">
			<li
				v-for="conversation in conversations"
				:key="conversation.id || conversation.created_at || conversation.content"
			>
				<p>{{ conversation.content }}</p>
				<small>{{ conversation.created_at || '-' }}</small>
			</li>
		</ul>
		<p v-else class="muted">暂无沟通记录。</p>

		<p v-if="disabled" class="muted">询价项已完成或已结束，不能再提交沟通。</p>
		<form v-else class="conversation-form" data-test="conversation-form" @submit.prevent="submit">
			<h4>新增沟通表单</h4>
			<label>
				沟通内容
				<textarea v-model="content" name="content" rows="4" required />
			</label>
			<label>
				状态动作
				<select v-model="stateAction" name="state_action">
					<option v-for="action in availableStateActions" :key="action.label" :value="action.value || ''">
						{{ action.label }}
					</option>
				</select>
			</label>
			<p class="muted">当前后端由前端串联两次请求完成沟通和状态更新，后续会补原子接口。</p>
			<button type="submit" :disabled="submitting">{{ submitting ? '提交中...' : '提交沟通' }}</button>
		</form>
	</section>
</template>
