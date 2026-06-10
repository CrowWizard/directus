<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { getTasksWithDetails, getUserTaskSummary, type TaskWithDetail } from '../api/purchase-flow';
import AppShell from '../components/app-shell.vue';
import TaskProgress from '../components/task-progress.vue';
import { useAuthStore } from '../stores/auth';
import type { RoleScope, UserTaskSummary, UserTaskSummaryDetail } from '../types/purchase-flow';
import { getStateLabel } from '../utils/inquiry-state';
import type { LatestStep } from '../utils/latest-step';

const auth = useAuthStore();
const tasks = ref<TaskWithDetail[]>([]);
const latestSteps = ref<Record<string, LatestStep>>({});
const summary = ref<UserTaskSummary | null>(null);
const loading = ref(true);
const error = ref('');

const filters = reactive({
	priority: '',
	state: '',
	deadline: '',
	customer: '',
	buyer: '',
});

const laneVisibleCount = reactive<Record<string, number>>({});

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
		const [result, taskSummary] = await Promise.all([
			getTasksWithDetails(auth.roleScope, auth.currentUser.id, signal),
			getUserTaskSummary(auth.currentUser.id, signal).catch(() => null),
		]);

		tasks.value = result.tasks;
		latestSteps.value = result.latestSteps;
		summary.value = taskSummary;
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '任务加载失败';
	} finally {
		loading.value = false;
	}
}

function personName(user: TaskWithDetail['sales_owner_id'] | TaskWithDetail['buyer_owner_id']) {
	if (!user) return '';
	if (typeof user === 'string') return user;

	return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || user.id;
}

function customerName(task: TaskWithDetail) {
	if (!task.customer_id) return '';
	if (typeof task.customer_id === 'string') return task.customer_id;

	return task.customer_id.customer_name || task.customer_id.customer_code || task.customer_id.id;
}

function normalize(value?: string | null) {
	return String(value || '').trim().toLowerCase();
}

function isOverdue(deadline?: string | null) {
	if (!deadline) return false;

	return new Date(deadline).getTime() < Date.now();
}

function getTaskLane(task: TaskWithDetail, roleScope: RoleScope) {
	if (roleScope === 'Buyer') {
		if (task.state === 'Assigned') return '待接单';
		if (task.state === 'Purchasing' && task.customer_quotes.length > 0) return '待补报价';

		return '采购中';
	}

	if (roleScope === 'Sales') {
		if (task.state === 'Draft') return '草稿';
		if (task.state === 'WaitingSalesReview' && task.customer_quotes.length > 0) return '待销售确认';

		return '待客户报价';
	}

	if (task.customer_quotes.some((quote) => quote.approval_status === 'Pending')) return '待审批';
	if (isOverdue(task.assignment_deadline)) return '超时未处理';

	return '进行中风险项';
}

const roleLanes = computed(() => {
	if (auth.roleScope === 'Buyer') return ['待接单', '采购中', '待补报价'];
	if (auth.roleScope === 'Sales') return ['草稿', '待客户报价', '待销售确认'];

	return ['待审批', '超时未处理', '进行中风险项'];
});

const priorities = computed(() => Array.from(new Set(tasks.value.map((task) => task.priority).filter(Boolean))));
const states = computed(() => Array.from(new Set(tasks.value.map((task) => task.state).filter(Boolean))));
const normalizedFilterCustomer = computed(() => normalize(filters.customer));
const normalizedFilterBuyer = computed(() => normalize(filters.buyer));

const filteredTasks = computed(() => {
	return tasks.value.filter((task) => {
		const matchesPriority = !filters.priority || task.priority === filters.priority;
		const matchesState = !filters.state || task.state === filters.state;
		const matchesDeadline = !filters.deadline || String(task.assignment_deadline || '').slice(0, 10) <= filters.deadline;
		const matchesCustomer = !normalizedFilterCustomer.value || normalize(customerName(task)).includes(normalizedFilterCustomer.value);
		const matchesBuyer = !normalizedFilterBuyer.value || normalize(personName(task.buyer_owner_id)).includes(normalizedFilterBuyer.value);

		return matchesPriority && matchesState && matchesDeadline && matchesCustomer && matchesBuyer;
	});
});

function clearFilters() {
	filters.priority = '';
	filters.state = '';
	filters.deadline = '';
	filters.customer = '';
	filters.buyer = '';
}

function getLaneVisibleCount(lane: string) {
	return laneVisibleCount[lane] ?? 8;
}

function showMoreForLane(lane: string, total: number) {
	laneVisibleCount[lane] = Math.min(getLaneVisibleCount(lane) + 8, total);
}

const taskGroups = computed(() => {
	const grouped = new Map(roleLanes.value.map((lane) => [lane, [] as TaskWithDetail[]]));

	for (const task of filteredTasks.value) {
		const lane = getTaskLane(task, auth.roleScope);
		const laneTasks = grouped.get(lane);

		if (laneTasks) {
			laneTasks.push(task);
		}
	}

	return roleLanes.value.map((lane) => {
		const tasks = grouped.get(lane) ?? [];
		const visibleCount = getLaneVisibleCount(lane);

		return {
			lane,
			hasMore: tasks.length > visibleCount,
			hiddenCount: Math.max(tasks.length - visibleCount, 0),
			tasks: tasks.slice(0, visibleCount),
			total: tasks.length,
		};
	});
});

function parseSummaryDetails(value: UserTaskSummary['active_task_details']): UserTaskSummaryDetail[] {
	if (!value) return [];

	const parsed = typeof value === 'string' ? safeParseJson(value) : value;
	if (Array.isArray(parsed)) return parsed as UserTaskSummaryDetail[];
	if (parsed && typeof parsed === 'object') return Object.values(parsed) as UserTaskSummaryDetail[];

	return [];
}

function safeParseJson(value: string) {
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return [];
	}
}

function summaryTaskId(detail: UserTaskSummaryDetail) {
	return detail.inquiry_item_id || detail.id || '';
}

function summaryOwner(detail: UserTaskSummaryDetail) {
	return detail.owner_name || detail.owner || detail.buyer_name || detail.buyer || detail.sales_name || detail.sales || '-';
}

const activeSummaryDetails = computed(() => parseSummaryDetails(summary.value?.active_task_details));
const weeklySummaryDetails = computed(() => parseSummaryDetails(summary.value?.weekly_completed_task_details));

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
			<p class="muted">按角色聚焦当前待办，先判断优先级，再进入询价详情处理。</p>
		</section>

		<p v-if="loading" class="state-card" role="status" aria-live="polite" aria-busy="true">正在加载任务...</p>
		<p v-else-if="error" class="state-card error" role="status" aria-live="polite">{{ error }}</p>
		<p v-else-if="tasks.length === 0" class="state-card" role="status" aria-live="polite">暂无待处理任务</p>

		<div v-else class="workbench-stack">
			<section class="summary-strip" aria-label="任务统计">
				<article class="summary-tile">
					<span>进行中</span>
					<strong>{{ summary?.active_task_count ?? filteredTasks.length }}</strong>
				</article>
				<article class="summary-tile">
					<span>本周完成</span>
					<strong>{{ summary?.weekly_completed_task_count ?? weeklySummaryDetails.length }}</strong>
				</article>
				<article class="summary-tile">
					<span>累计完成</span>
					<strong>{{ summary?.total_completed_task_count ?? '-' }}</strong>
				</article>
			</section>

			<section class="filter-panel" aria-label="任务筛选">
				<div class="filter-panel__header">
					<div>
						<h3>任务筛选</h3>
						<p class="muted">缩小范围后，再逐条推进询价。</p>
					</div>
					<button type="button" class="ghost-button" @click="clearFilters">清空筛选</button>
				</div>
				<div class="filter-panel__grid">
					<label>
						优先级
						<select v-model="filters.priority">
							<option value="">全部优先级</option>
							<option v-for="priority in priorities" :key="priority" :value="priority">{{ priority }}</option>
						</select>
					</label>
					<label>
						状态
						<select v-model="filters.state">
							<option value="">全部状态</option>
							<option v-for="state in states" :key="state" :value="state">{{ getStateLabel(state) }}</option>
						</select>
					</label>
					<label>
						截止时间不晚于
						<input v-model="filters.deadline" type="date" />
					</label>
					<label>
						客户
						<input v-model="filters.customer" placeholder="输入客户名称" />
					</label>
					<label>
						采购员
						<input v-model="filters.buyer" placeholder="输入采购员名称" />
					</label>
				</div>
			</section>

			<section class="lane-grid" aria-label="角色任务分组">
				<article v-for="group in taskGroups" :key="group.lane" class="lane-card">
					<header class="lane-card__header">
						<h3>{{ group.lane }}</h3>
						<span>{{ group.total }}</span>
					</header>
					<p v-if="group.tasks.length === 0" class="muted">暂无任务</p>
					<div v-else class="lane-card__list">
						<article v-for="task in group.tasks" :key="task.id" class="task-card compact">
							<div class="task-card__top">
								<div>
									<p class="muted">{{ task.inquiry_no || task.id }}</p>
									<h3>{{ task.product_name || task.inquiry_no || '未命名询价项' }}</h3>
								</div>
								<TaskProgress :item="task" :state="task.state" />
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
									<dt>客户</dt>
									<dd>{{ customerName(task) || '-' }}</dd>
								</div>
								<div>
									<dt>采购员</dt>
									<dd>{{ personName(task.buyer_owner_id) || '-' }}</dd>
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
					<button v-if="group.hasMore" type="button" class="ghost-button lane-card__more" @click="showMoreForLane(group.lane, group.total)">
						再显示 {{ Math.min(group.hiddenCount, 8) }} 条
					</button>
				</article>
			</section>

			<section class="info-card">
				<div class="card-header-row">
					<div>
						<h3>任务摘要详情</h3>
						<p class="muted">保留快照摘要，便于快速判断负责人、客户和截止时间。</p>
					</div>
				</div>
				<div v-if="activeSummaryDetails.length" class="summary-detail-list">
					<article v-for="detail in activeSummaryDetails" :key="summaryTaskId(detail) || detail.inquiry_no" class="summary-detail-card">
						<div class="task-card__top">
							<div>
								<p class="muted">{{ detail.inquiry_no || summaryTaskId(detail) || '未关联询价编号' }}</p>
								<h4>{{ detail.product_name || '未命名任务' }}</h4>
							</div>
							<span class="status-pill status-pill--neutral">{{ getStateLabel(detail.state || detail.status) }}</span>
						</div>
						<dl class="meta-grid">
							<div><dt>优先级</dt><dd>{{ detail.priority || '-' }}</dd></div>
							<div><dt>截止时间</dt><dd>{{ detail.deadline || detail.assignment_deadline || '-' }}</dd></div>
							<div><dt>客户</dt><dd>{{ detail.customer_name || detail.customer || '-' }}</dd></div>
							<div><dt>负责人</dt><dd>{{ summaryOwner(detail) }}</dd></div>
						</dl>
						<RouterLink v-if="summaryTaskId(detail)" class="text-link" :to="`/inquiry-items/${summaryTaskId(detail)}/detail`">快捷处理</RouterLink>
					</article>
				</div>
				<p v-else class="muted">暂无可视化摘要详情。</p>
				<div v-if="weeklySummaryDetails.length" class="completed-strip">
					<h4>本周完成</h4>
					<ul>
						<li v-for="detail in weeklySummaryDetails" :key="`done-${summaryTaskId(detail) || detail.inquiry_no}`">
							<span>{{ detail.inquiry_no || summaryTaskId(detail) || '-' }}</span>
							<strong>{{ detail.product_name || '未命名任务' }}</strong>
							<small>{{ detail.completed_at || detail.updated_at || '-' }}</small>
						</li>
					</ul>
				</div>
			</section>
		</div>
	</AppShell>
</template>
