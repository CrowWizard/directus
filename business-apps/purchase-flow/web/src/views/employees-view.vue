<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import {
	createEmployee,
	listBuyerProfiles,
	listEmployees,
	listRoles,
	updateEmployee,
	updateEmployeeStatus,
} from '../api/purchase-flow';
import AppShell from '../components/app-shell.vue';
import { useAuthStore } from '../stores/auth';
import type { BuyerProfile, DirectusRole, Employee } from '../types/purchase-flow';

const auth = useAuthStore();
const employees = ref<Employee[]>([]);
const roles = ref<DirectusRole[]>([]);
const buyerProfiles = ref<BuyerProfile[]>([]);
const loading = ref(true);
const submitting = ref(false);
const error = ref('');
const expandedEmployeeId = ref('');
const showForm = ref(false);
const editingId = ref('');

const requestController = new AbortController();

const form = reactive({
	email: '',
	password: '',
	first_name: '',
	last_name: '',
	role: '',
	status: 'active',
	wechat_work_userid: '',
});

const businessRoleNames = ['外贸员', '采购员', '经理'];

const activeEmployeeCount = computed(() => employees.value.filter((employee) => employee.status === 'active').length);
const buyerProfileCount = computed(() => buyerProfiles.value.length);

function roleId(employee: Employee) {
	if (!employee.role) return '';
	if (typeof employee.role === 'string') return employee.role;

	return employee.role.id || '';
}

function roleName(employee: Employee) {
	if (!employee.role) return '-';
	if (typeof employee.role === 'string') return employee.role;

	return employee.role.name || employee.role.id || '-';
}

function employeeName(employee: Employee) {
	return [employee.first_name, employee.last_name].filter(Boolean).join(' ') || employee.email || employee.id;
}

function getBuyerProfile(userId: string) {
	return buyerProfiles.value.find((profile) => getRelationId(profile.buyer_id) === userId);
}

function getRelationId(value: BuyerProfile['buyer_id']) {
	if (!value) return '';
	if (typeof value === 'string') return value;

	return value.id;
}

function reset() {
	editingId.value = '';
	form.email = '';
	form.password = '';
	form.first_name = '';
	form.last_name = '';
	form.role = '';
	form.status = 'active';
	form.wechat_work_userid = '';
}

function openCreateForm() {
	reset();
	showForm.value = true;
}

function edit(employee: Employee) {
	editingId.value = employee.id;
	showForm.value = true;
	form.email = employee.email || '';
	form.password = '';
	form.first_name = employee.first_name || '';
	form.last_name = employee.last_name || '';
	form.role = roleId(employee);
	form.status = employee.status || 'active';
	form.wechat_work_userid = employee.wechat_work_userid || '';
}

function closeForm() {
	showForm.value = false;
	reset();
}

function toggleDetails(employee: Employee) {
	expandedEmployeeId.value = expandedEmployeeId.value === employee.id ? '' : employee.id;
}

async function load(signal: AbortSignal) {
	loading.value = true;
	error.value = '';

	try {
		employees.value = await listEmployees(signal).catch((err) => {
			throw new Error(`员工列表加载失败：${getErrorMessage(err)}`);
		});

		roles.value = mergeBusinessRoles(await listRoles(signal).catch(() => []));
		buyerProfiles.value = await listBuyerProfiles(signal).catch(() => []);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '员工加载失败';
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

function normalizePayload() {
	const payload: Record<string, unknown> = {
		email: form.email.trim(),
		first_name: form.first_name.trim(),
		last_name: form.last_name.trim(),
		role: form.role || null,
		status: form.status || 'active',
		wechat_work_userid: form.wechat_work_userid.trim() || null,
	};

	if (form.password.trim()) payload.password = form.password.trim();

	return payload;
}

async function save() {
	if (!auth.isManager || submitting.value || !form.email.trim()) return;

	submitting.value = true;
	error.value = '';

	try {
		const payload = normalizePayload();

		if (editingId.value) {
			await updateEmployee(editingId.value, payload, requestController.signal);
		} else {
			await createEmployee(payload, requestController.signal);
		}

		closeForm();
		await load(requestController.signal);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '员工保存失败';
	} finally {
		submitting.value = false;
	}
}

async function toggleStatus(employee: Employee) {
	if (!auth.isManager || submitting.value) return;

	submitting.value = true;
	error.value = '';

	try {
		await updateEmployeeStatus(employee.id, employee.status === 'active' ? 'archived' : 'active', requestController.signal);
		await load(requestController.signal);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '员工状态更新失败';
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
				<p class="eyebrow">Employees</p>
				<h2>员工管理</h2>
			</div>
			<button v-if="!showForm" type="button" class="ghost-button" @click="openCreateForm">+ 新增员工</button>
		</section>

		<p v-if="loading" class="state-card" role="status" aria-live="polite" aria-busy="true">正在加载员工...</p>
		<p v-else-if="error" class="state-card error" role="status" aria-live="polite">{{ error }}</p>
		<div v-else class="management-stack">
			<form v-if="showForm" class="entity-form entity-form--standalone" :aria-busy="submitting ? 'true' : undefined" @submit.prevent="save">
				<h3>{{ editingId ? '编辑员工' : '新增员工' }}</h3>
				<label for="employee-email">邮箱<input id="employee-email" v-model="form.email" name="email" type="email" autocomplete="email" required :disabled="submitting" /></label>
				<label for="employee-password">密码<input id="employee-password" v-model="form.password" name="password" type="password" autocomplete="new-password" :placeholder="editingId ? '留空则不修改密码' : ''" :required="!editingId" :disabled="submitting" /></label>
				<label for="employee-first-name">名<input id="employee-first-name" v-model="form.first_name" name="first_name" autocomplete="given-name" :disabled="submitting" /></label>
				<label for="employee-last-name">姓<input id="employee-last-name" v-model="form.last_name" name="last_name" autocomplete="family-name" :disabled="submitting" /></label>
				<label for="employee-role">角色<select id="employee-role" v-model="form.role" name="role" :disabled="submitting"><option value="">请选择角色</option><option v-for="role in roles" :key="role.id" :value="role.id">{{ role.name || role.id }}</option></select></label>
				<label for="employee-status">状态<select id="employee-status" v-model="form.status" name="status" :disabled="submitting"><option value="active">启用</option><option value="archived">停用</option></select></label>
				<label for="employee-wechat">企业微信 UserID<input id="employee-wechat" v-model="form.wechat_work_userid" name="wechat_work_userid" autocomplete="off" :disabled="submitting" /></label>
				<div class="form-actions">
					<button type="submit" :disabled="submitting || !auth.isManager">{{ submitting ? '保存中...' : (editingId ? '保存修改' : '新增员工') }}</button>
					<button type="button" class="ghost-button" :disabled="submitting" @click="closeForm">取消</button>
				</div>
			</form>

			<section class="summary-strip" aria-label="员工统计">
				<article class="summary-tile"><span>员工总数</span><strong>{{ employees.length }}</strong></article>
				<article class="summary-tile"><span>启用员工</span><strong>{{ activeEmployeeCount }}</strong></article>
				<article class="summary-tile"><span>采购员画像</span><strong>{{ buyerProfileCount }}</strong></article>
			</section>

			<div class="table-card table-card--wide">
				<table>
					<thead>
						<tr>
							<th scope="col">员工</th>
							<th scope="col">邮箱</th>
							<th scope="col">角色</th>
							<th scope="col">状态</th>
							<th scope="col">企业微信</th>
							<th scope="col">采购员画像</th>
							<th scope="col">操作</th>
						</tr>
					</thead>
					<tbody>
						<template v-for="employee in employees" :key="employee.id">
							<tr>
								<td>{{ employeeName(employee) }}</td>
								<td>{{ employee.email || '-' }}</td>
								<td>{{ roleName(employee) }}</td>
								<td>{{ employee.status || '-' }}</td>
								<td>{{ employee.wechat_work_userid || '-' }}</td>
								<td>{{ getBuyerProfile(employee.id) ? '已配置' : '-' }}</td>
								<td class="row-actions">
									<button type="button" class="ghost-button" :disabled="submitting" @click="toggleDetails(employee)">{{ expandedEmployeeId === employee.id ? '收起' : '详情' }}</button>
									<button type="button" class="ghost-button" :disabled="submitting" @click="edit(employee)">编辑</button>
									<button type="button" class="ghost-button" :disabled="submitting" @click="toggleStatus(employee)">{{ employee.status === 'active' ? '停用' : '启用' }}</button>
								</td>
							</tr>
							<tr v-if="expandedEmployeeId === employee.id" class="detail-row">
								<td colspan="7">
									<div class="management-detail-grid">
										<section>
											<h3>员工信息</h3>
											<ul class="mini-list">
												<li><strong>ID</strong><span>{{ employee.id }}</span></li>
												<li><strong>企业微信</strong><span>{{ employee.wechat_work_userid || '-' }}</span></li>
											</ul>
										</section>
										<section>
											<h3>采购员画像摘要</h3>
											<ul v-if="getBuyerProfile(employee.id)" class="mini-list">
												<li><strong>Tag</strong><span>{{ getBuyerProfile(employee.id)?.tags || '-' }}</span></li>
												<li><strong>品牌</strong><span>{{ getBuyerProfile(employee.id)?.brands || '-' }}</span></li>
												<li><strong>评分</strong><span>{{ getBuyerProfile(employee.id)?.score ?? '-' }}</span></li>
												<li><strong>可分配</strong><span>{{ getBuyerProfile(employee.id)?.is_available === false ? '否' : '是' }}</span></li>
											</ul>
											<p v-else class="muted">暂无采购员画像，可到采购员画像页面配置。</p>
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
