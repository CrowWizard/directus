<template>
	<app-shell>
		<section class="section-header">
			<div>
				<p class="eyebrow">Tasks</p>
				<h2>我的任务</h2>
			</div>
			<p class="muted">基于当前角色直接查询 inquiry_items，不依赖摘要 JSON。</p>
		</section>

		<p v-if="loading" class="state-card">正在加载任务...</p>
		<p v-else-if="error" class="state-card error">{{ error }}</p>
		<p v-else-if="tasks.length === 0" class="state-card">暂无待处理任务。</p>

		<div v-else class="task-grid">
			<article v-for="task in tasks" :key="task.id" class="task-card">
				<div class="task-card__top">
					<div>
						<p class="muted">{{ task.inquiry_no || task.id }}</p>
						<h3>{{ task.inquiry_item_name || task.询价项_name || task.product_name || '未命名询价项' }}</h3>
					</div>
					<task-progress :state="task.state" />
				</div>
				<dl class="meta-grid">
					<div><dt>产品</dt><dd>{{ task.product_name || '-' }}</dd></div>
					<div><dt>品牌</dt><dd>{{ task.brand || '-' }}</dd></div>
					<div><dt>优先级</dt><dd>{{ task.priority || '-' }}</dd></div>
					<div><dt>截止时间</dt><dd>{{ task.assignment_deadline || '-' }}</dd></div>
				</dl>
				<section class="latest-step">
					<strong>{{ latestSteps[task.id]?.title || '最新一步' }}</strong>
					<p>{{ latestSteps[task.id]?.detail || '正在推导最新一步...' }}</p>
				</section>
				<router-link class="text-link" :to="`/inquiry-items/${task.id}/detail`">查看完整详情</router-link>
			</article>
		</div>
	</app-shell>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';

import AppShell from '../components/app-shell.vue';
import TaskProgress from '../components/task-progress.vue';
import { getTasks, get询价项Detail } from '../api/purchase-flow';
import { useAuthStore } from '../stores/auth';
import type { InquiryItem } from '../types/purchase-flow';
import { getLatestStep, type LatestStep } from '../utils/latest-step';

const auth = useAuthStore();
const tasks = ref<InquiryItem[]>([]);
const latestSteps = ref<Record<string, LatestStep>>({});
const loading = ref(true);
const error = ref('');

async function loadTasks() {
	if (!auth.currentUser?.id) {
		error.value = '无法识别当前用户，请重新登录。';
		loading.value = false;
		return;
	}

	loading.value = true;
	error.value = '';

	try {
		tasks.value = await getTasks(auth.roleScope, auth.currentUser.id);

		const details = await Promise.all(tasks.value.map((task) => get询价项Detail(task.id)));
		latestSteps.value = Object.fromEntries(
			details.map((detail) => [
				detail.id,
				getLatestStep({
					询价项: detail,
					conversations: detail.conversations,
					customerQuotes: detail.customer_quotes,
					supplierQuotes: detail.supplier_quotes,
				}),
			]),
		);
	} catch (err) {
		error.value = err instanceof Error ? err.message : '任务加载失败';
	} finally {
		loading.value = false;
	}
}

onMounted(loadTasks);
</script>
