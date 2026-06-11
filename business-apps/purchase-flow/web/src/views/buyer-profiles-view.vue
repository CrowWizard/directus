<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import {
	listBuyerProfiles,
	listEmployees,
	listPurchaseTags,
	listRoles,
	upsertBuyerProfile,
} from '../api/purchase-flow';
import AppShell from '../components/app-shell.vue';
import TagMultiSelect from '../components/tag-multi-select.vue';
import { useAuthStore } from '../stores/auth';
import type { BuyerProfile, DirectusRole, Employee, PurchaseTag } from '../types/purchase-flow';

const auth = useAuthStore();
const employees = ref<Employee[]>([]);
const roles = ref<DirectusRole[]>([]);
const profiles = ref<BuyerProfile[]>([]);
const tags = ref<PurchaseTag[]>([]);
const loading = ref(true);
const submitting = ref(false);
const error = ref('');
const expandedBuyerId = ref('');
const showForm = ref(false);
const editingProfile = ref(false);

const requestController = new AbortController();

const form = reactive({
	buyer_id: '',
	tags: [] as string[],
	brands: '',
	score: '80',
	is_available: true,
});

const businessRoleNames = ['外贸员', '采购员', '经理'];

const enabledTags = computed(() => tags.value.filter((tag) => tag.enabled !== false));
const buyerEmployees = computed(() => {
	const profileBuyerIds = new Set(profiles.value.map((profile) => getProfileBuyerId(profile)).filter(Boolean));

	return employees.value.filter((employee) => isBuyerEmployee(employee) || profileBuyerIds.has(employee.id));
});
const selectableBuyerEmployees = computed(() => {
	const profiledBuyerIds = new Set(profiles.value.map((profile) => getProfileBuyerId(profile)).filter(Boolean));

	return buyerEmployees.value.filter((employee) => editingProfile.value || !profiledBuyerIds.has(employee.id));
});

const selectedBuyerOption = computed(() => {
	if (!editingProfile.value || !form.buyer_id) return null;

	return employees.value.find((employee) => employee.id === form.buyer_id) || null;
});

const availableProfileCount = computed(() => profiles.value.filter((profile) => profile.is_available !== false).length);

function isBuyerEmployee(employee: Employee) {
	return /采购|buyer/i.test(roleName(employee));
}

function roleName(employee: Employee) {
	if (!employee.role) return '';
	if (typeof employee.role === 'string') return employee.role;

	return employee.role.name || employee.role.id || '';
}

function buyerName(profile: BuyerProfile) {
	const buyer = profile.buyer_id;
	if (!buyer) return '-';
	if (typeof buyer === 'string') return buyer;

	return [buyer.first_name, buyer.last_name].filter(Boolean).join(' ') || buyer.email || buyer.id;
}

function employeeName(employee: Employee) {
	return [employee.first_name, employee.last_name].filter(Boolean).join(' ') || employee.email || employee.id;
}

function getRelationId(value: BuyerProfile['buyer_id']) {
	if (!value) return '';
	if (typeof value === 'string') return value;

	return value.id;
}

function getProfileBuyerId(profile: BuyerProfile) {
	return getRelationId(profile.buyer_id) || String(profile.buyer_id || '');
}

function parseCsv(value?: string | null) {
	return String(value || '')
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
}

function reset() {
	editingProfile.value = false;
	form.buyer_id = '';
	form.tags = [];
	form.brands = '';
	form.score = '80';
	form.is_available = true;
}

function openCreateForm() {
	reset();
	editingProfile.value = false;
	showForm.value = true;
}

function edit(profile: BuyerProfile) {
	editingProfile.value = true;
	showForm.value = true;
	form.buyer_id = getProfileBuyerId(profile);
	form.tags = parseCsv(profile.tags);
	form.brands = profile.brands || '';
	form.score = String(profile.score ?? 80);
	form.is_available = profile.is_available !== false;
}

function closeForm() {
	showForm.value = false;
	reset();
}

function toggleDetails(profile: BuyerProfile) {
	const buyerId = getRelationId(profile.buyer_id) || profile.id || '';
	expandedBuyerId.value = expandedBuyerId.value === buyerId ? '' : buyerId;
}

async function load(signal: AbortSignal) {
	loading.value = true;
	error.value = '';

	try {
		employees.value = await listEmployees(signal).catch((err) => {
			throw new Error(`员工列表加载失败：${getErrorMessage(err)}`);
		});
		roles.value = mergeBusinessRoles(await listRoles(signal).catch(() => []));
		profiles.value = await listBuyerProfiles(signal);
		tags.value = await listPurchaseTags(signal).catch(() => []);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '采购员画像加载失败';
	} finally {
		loading.value = false;
	}
}

function buildRolesFromEmployees(employeeRows: Employee[]): DirectusRole[] {
	return employeeRows
		.map((employee) => employee.role)
		.filter((role): role is { id: string; name?: string | null } => Boolean(role && typeof role !== 'string' && role.id))
		.filter((role, index, rows) => rows.findIndex((item) => item.id === role.id) === index);
}

function mergeBusinessRoles(roleRows: DirectusRole[]) {
	const roleMap = new Map<string, DirectusRole>();

	for (const role of [...roleRows, ...buildRolesFromEmployees(employees.value)]) {
		if (!role.name || !businessRoleNames.includes(role.name)) continue;
		roleMap.set(role.id, role);
	}

	return Array.from(roleMap.values()).sort((left, right) => businessRoleNames.indexOf(left.name || '') - businessRoleNames.indexOf(right.name || ''));
}

function getErrorMessage(error: unknown) {
	const source = error as { message?: string; response?: { data?: { errors?: Array<{ message?: string }> } } };

	return source.response?.data?.errors?.[0]?.message || source.message || '请求失败';
}

async function save() {
	if (!auth.isManager || submitting.value || !form.buyer_id) return;

	submitting.value = true;
	error.value = '';

	try {
		await upsertBuyerProfile(
			form.buyer_id,
			{
				brands: form.brands.trim(),
				is_available: form.is_available,
				score: form.score ? Number(form.score) : null,
				tags: form.tags.join(','),
			},
			requestController.signal,
		);

		closeForm();
		await load(requestController.signal);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '采购员画像保存失败';
	} finally {
		submitting.value = false;
	}
}

onMounted(() => {
	load(requestController.signal);
});

onUnmounted(() => {
	requestController.abort();
});
</script>

<template>
	<AppShell>
		<section class="section-header">
			<div>
				<p class="eyebrow">Buyer Profiles</p>
				<h2>采购员画像</h2>
			</div>
			<button v-if="!showForm" type="button" class="ghost-button" @click="openCreateForm">+ 新增画像</button>
		</section>

		<p v-if="loading" class="state-card" role="status" aria-live="polite" aria-busy="true">正在加载采购员画像...</p>
		<p v-else-if="error" class="state-card error" role="status" aria-live="polite">{{ error }}</p>
		<div v-else class="management-stack">
			<form v-if="showForm" class="entity-form entity-form--standalone" :aria-busy="submitting ? 'true' : undefined" @submit.prevent="save">
				<h3>{{ editingProfile ? '编辑画像' : '新增画像' }}</h3>
				<label for="profile-buyer">采购员<select id="profile-buyer" v-model="form.buyer_id" name="buyer_id" required :disabled="submitting || editingProfile"><option value="">请选择采购员</option><option v-if="selectedBuyerOption && !selectableBuyerEmployees.some((employee) => employee.id === selectedBuyerOption?.id)" :value="selectedBuyerOption.id">{{ employeeName(selectedBuyerOption) }} / {{ selectedBuyerOption.email }}</option><option v-for="employee in selectableBuyerEmployees" :key="employee.id" :value="employee.id">{{ employeeName(employee) }} / {{ employee.email }}</option></select></label>
				<TagMultiSelect v-model="form.tags" label="采购员 Tag" :options="enabledTags" :disabled="submitting" />
				<label for="profile-brands">熟悉品牌<input id="profile-brands" v-model="form.brands" name="brands" autocomplete="off" :disabled="submitting" placeholder="Omron,Siemens" /></label>
				<label for="profile-score">分配评分<input id="profile-score" v-model="form.score" name="score" type="number" min="0" step="1" :disabled="submitting" /></label>
				<label class="inline-check"><input v-model="form.is_available" name="is_available" type="checkbox" :disabled="submitting" /> 可参与自动分配</label>
				<div class="form-actions">
					<button type="submit" :disabled="submitting || !auth.isManager">{{ submitting ? '保存中...' : '保存画像' }}</button>
					<button type="button" class="ghost-button" :disabled="submitting" @click="closeForm">取消</button>
				</div>
			</form>

			<section class="summary-strip" aria-label="采购员画像统计">
				<article class="summary-tile"><span>画像总数</span><strong>{{ profiles.length }}</strong></article>
				<article class="summary-tile"><span>可分配</span><strong>{{ availableProfileCount }}</strong></article>
				<article class="summary-tile"><span>采购员员工</span><strong>{{ buyerEmployees.length }}</strong></article>
			</section>

			<div class="table-card table-card--wide">
				<table>
					<thead>
						<tr>
							<th scope="col">采购员</th>
							<th scope="col">Tag</th>
							<th scope="col">熟悉品牌</th>
							<th scope="col">评分</th>
							<th scope="col">进行中</th>
							<th scope="col">已完成</th>
							<th scope="col">可分配</th>
							<th scope="col">操作</th>
						</tr>
					</thead>
					<tbody>
						<template v-for="profile in profiles" :key="profile.id || getRelationId(profile.buyer_id)">
							<tr>
								<td>{{ buyerName(profile) }}</td>
								<td>{{ profile.tags || '-' }}</td>
								<td>{{ profile.brands || '-' }}</td>
								<td class="cell-numeric">{{ profile.score ?? '-' }}</td>
								<td class="cell-numeric">{{ profile.active_task_count ?? 0 }}</td>
								<td class="cell-numeric">{{ profile.completed_task_count ?? 0 }}</td>
								<td>{{ profile.is_available === false ? '否' : '是' }}</td>
								<td class="row-actions">
									<button type="button" class="ghost-button" :disabled="submitting" @click="toggleDetails(profile)">{{ expandedBuyerId === (getRelationId(profile.buyer_id) || profile.id) ? '收起' : '详情' }}</button>
									<button type="button" class="ghost-button" :disabled="submitting" @click="edit(profile)">编辑</button>
								</td>
							</tr>
							<tr v-if="expandedBuyerId === (getRelationId(profile.buyer_id) || profile.id)" class="detail-row">
								<td colspan="8">
									<div class="management-detail-grid">
										<section>
											<h3>自动分配依据</h3>
											<ul class="mini-list">
												<li><strong>Tag</strong><span>{{ profile.tags || '-' }}</span></li>
												<li><strong>熟悉品牌</strong><span>{{ profile.brands || '-' }}</span></li>
												<li><strong>评分</strong><span>{{ profile.score ?? '-' }}</span></li>
											</ul>
										</section>
										<section>
											<h3>任务负载</h3>
											<ul class="mini-list">
												<li><strong>进行中任务</strong><span>{{ profile.active_task_count ?? 0 }}</span></li>
												<li><strong>已完成任务</strong><span>{{ profile.completed_task_count ?? 0 }}</span></li>
												<li><strong>是否可分配</strong><span>{{ profile.is_available === false ? '否' : '是' }}</span></li>
											</ul>
										</section>
									</div>
								</td>
							</tr>
						</template>
					</tbody>
				</table>
			</div>
		</div>
	</AppShell>
</template>
