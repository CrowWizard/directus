<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { getTasksWithDetails, type TaskWithDetail } from '../api/purchase-flow';
import AppShell from '../components/app-shell.vue';
import TaskProgress from '../components/task-progress.vue';
import { useAuthStore } from '../stores/auth';
import type { LatestStep } from '../utils/latest-step';

const auth = useAuthStore();
const tasks = ref<TaskWithDetail[]>([]);
const latestSteps = ref<Record<string, LatestStep>>({});
const loading = ref(true);
const error = ref('');

const requestController = new AbortController();

async function loadTasks(signal: AbortSignal) {
	if (!auth.currentUser?.id) {
		error.value = '无法识别当前用户，请重新登录。';
		loading.value = false;
		return;
	}

	loading.value = true;
	error.value = '';

	try {
		const result = await getTasksWithDetails(auth.roleScope, auth.currentUser.id, signal);

		tasks.value = result.tasks;
		latestSteps.value = result.latestSteps;
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '任务加载失败';
	} finally {
		loading.value = false;
	}
}

onMounted(() => {
	loadTasks(requestController.signal);
});

onUnmounted(() => {
	requestController.abort();
});
</script>

<template>
	<AppShell>
		<section class="section-header">
			<div>
				<p class="eyebrow">Tasks</p>
				<h2>我的任务</h2>
			</div>
			<p class="muted">基于当前角色直接查询 inquiry_items，不依赖摘要 JSON。</p>
		</section>

		<p v-if="loading" class="state-card" role="status" aria-live="polite" aria-busy="true">正在加载任务...</p>
		<p v-else-if="error" class="state-card error" role="status" aria-live="polite">{{ error }}</p>
		<p v-else-if="tasks.length === 0" class="state-card" role="status" aria-live="polite">暂无待处理任务</p>

		<div v-else class="task-grid">
			<article v-for="task in tasks" :key="task.id" class="task-card">
				<div class="task-card__top">
					<div>
						<p class="muted">{{ task.inquiry_no || task.id }}</p>
						<h3>{{ task.product_name || task.inquiry_no || '未命名询价项' }}</h3>
					</div>
					<TaskProgress :state="task.state" />
				</div>
				<dl class="meta-grid">
					<div>
						<dt>产品</dt>
						<dd>{{ task.product_name || '-' }}</dd>
					</div>
					<div>
						<dt>品牌</dt>
						<dd>{{ task.brand || '-' }}</dd>
					</div>
					<div>
						<dt>优先级</dt>
						<dd>{{ task.priority || '-' }}</dd>
					</div>
					<div>
						<dt>截止时间</dt>
						<dd>{{ task.assignment_deadline || '-' }}</dd>
					</div>
				</dl>
				<section class="latest-step">
					<strong>{{ latestSteps[task.id]?.title || '最新一步' }}</strong>
					<p>{{ latestSteps[task.id]?.detail || '正在推导最新一步...' }}</p>
				</section>
				<RouterLink class="text-link" :to="`/inquiry-items/${task.id}/detail`">查看完整详情</RouterLink>
			</article>
		</div>
	</AppShell>
</template>
