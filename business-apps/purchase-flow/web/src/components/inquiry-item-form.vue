<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { listCustomers, listEmployees, listPurchaseTags, uploadFile } from '../api/purchase-flow';
import type { Customer, Employee, PurchaseTag } from '../types/purchase-flow';
import TagMultiSelect from './tag-multi-select.vue';

type Priority = 'Low' | 'Normal' | 'High' | 'Urgent';

const props = defineProps<{
	submitting: boolean;
	salesOwnerId: string;
	resetKey: number;
}>();

const emit = defineEmits<{
	submit: [payload: Record<string, unknown>];
	cancel: [];
}>();

const priorities: Array<{ label: string; value: Priority }> = [
	{ label: '低', value: 'Low' },
	{ label: '普通', value: 'Normal' },
	{ label: '高', value: 'High' },
	{ label: '紧急', value: 'Urgent' },
];

const customers = ref<Customer[]>([]);
const buyers = ref<Employee[]>([]);
const tags = ref<PurchaseTag[]>([]);
const customersLoading = ref(false);
const buyersLoading = ref(false);
const selectedFiles = ref<File[]>([]);
const uploadError = ref('');

const form = reactive({
	customer_id: '' as string,
	project_name: '',
	product_name: '',
	brand: '',
	model: '',
	specification: '',
	quantity: '' as string,
	unit: '',
	target_price: '' as string,
	expected_quote_at: '',
	priority: 'Normal' as Priority,
	buyer_owner_id: '' as string,
	remark: '',
	tags: [] as string[],
});

let lastResetKey = props.resetKey;

function reset() {
	form.customer_id = '';
	form.project_name = '';
	form.product_name = '';
	form.brand = '';
	form.model = '';
	form.specification = '';
	form.quantity = '';
	form.unit = '';
	form.target_price = '';
	form.expected_quote_at = '';
	form.priority = 'Normal';
	form.buyer_owner_id = '';
	form.remark = '';
	form.tags = [];
	selectedFiles.value = [];
	uploadError.value = '';
}

watch(
	() => props.resetKey,
	(key) => {
		if (key !== lastResetKey) {
			lastResetKey = key;
			reset();
		}
	},
);

const canSubmit = computed(() => {
	return form.product_name.trim().length > 0;
});

function submit() {
	if (props.submitting || !canSubmit.value) return;

	void submitWithFiles();
}

async function submitWithFiles() {
	uploadError.value = '';

	const payload: Record<string, unknown> = {
		product_name: form.product_name.trim(),
		priority: form.priority,
		sales_owner_id: props.salesOwnerId,
		state: 'Draft',
	};

	if (form.customer_id) payload.customer_id = form.customer_id;
	if (form.project_name.trim()) payload.project_name = form.project_name.trim();
	if (form.brand.trim()) payload.brand = form.brand.trim();
	if (form.model.trim()) payload.model = form.model.trim();
	if (form.specification.trim()) payload.specification = form.specification.trim();
	if (form.quantity) payload.quantity = Number(form.quantity);
	if (form.unit.trim()) payload.unit = form.unit.trim();
	if (form.target_price) payload.target_price = Number(form.target_price);
	if (form.expected_quote_at) payload.expected_quote_at = form.expected_quote_at;
	if (form.buyer_owner_id) payload.buyer_owner_id = form.buyer_owner_id;
	if (form.remark.trim()) payload.remark = form.remark.trim();
	if (form.tags.length) payload.tags = form.tags.join(',');

	try {
		if (selectedFiles.value.length) {
			const uploadedFiles = await Promise.all(selectedFiles.value.map((file) => uploadFile(file)));
			payload.attachment_ids = uploadedFiles.map((file) => ({
				filename_download: file.filename_download || file.id,
				id: file.id,
			}));
		}
	} catch (err) {
		uploadError.value = err instanceof Error ? err.message : '文档上传失败';
		return;
	}

	emit('submit', payload);
}

function handleFiles(event: Event) {
	const input = event.target as HTMLInputElement;
	selectedFiles.value = Array.from(input.files || []);
}

function employeeName(employee: Employee) {
	return [employee.first_name, employee.last_name].filter(Boolean).join(' ') || employee.email || employee.id;
}

function isBuyer(employee: Employee) {
	const role = employee.role;
	const roleName = typeof role === 'string' ? role : role?.name || '';

	return /采购|buyer/i.test(roleName);
}

async function loadCustomers() {
	customersLoading.value = true;

	try {
		customers.value = await listCustomers();
	} catch {
		customers.value = [];
	} finally {
		customersLoading.value = false;
	}
}

async function loadTags() {
	try {
		tags.value = (await listPurchaseTags()).filter((tag) => tag.enabled !== false);
	} catch {
		tags.value = [];
	}
}

async function loadBuyers() {
	buyersLoading.value = true;

	try {
		buyers.value = (await listEmployees()).filter((employee) => employee.status !== 'archived' && isBuyer(employee));
	} catch {
		buyers.value = [];
	} finally {
		buyersLoading.value = false;
	}
}

loadCustomers();
loadBuyers();
loadTags();
</script>

<template>
	<form class="entity-form" :aria-busy="submitting ? 'true' : undefined" @submit.prevent="submit">
		<h3>新增询价项</h3>
		<div class="inquiry-form-grid">
			<label for="field-customer_id">
				客户
				<select id="field-customer_id" v-model="form.customer_id" name="customer_id" :disabled="submitting || customersLoading">
					<option value="">— 选择客户 —</option>
					<option v-for="c in customers" :key="c.id" :value="c.id">{{ c.customer_name || c.customer_code || c.id }}</option>
				</select>
			</label>
			<label for="field-project_name">
				项目名称
				<input id="field-project_name" v-model="form.project_name" name="project_name" autocomplete="off" :disabled="submitting" />
			</label>
			<label for="field-product_name">
				产品名称 <small class="required">*</small>
				<input id="field-product_name" v-model="form.product_name" name="product_name" autocomplete="off" required :disabled="submitting" />
			</label>
			<label for="field-brand">
				品牌
				<input id="field-brand" v-model="form.brand" name="brand" autocomplete="off" :disabled="submitting" />
			</label>
			<label for="field-model">
				型号
				<input id="field-model" v-model="form.model" name="model" autocomplete="off" :disabled="submitting" />
			</label>
			<label for="field-specification">
				规格参数
				<input id="field-specification" v-model="form.specification" name="specification" autocomplete="off" :disabled="submitting" />
			</label>
			<label for="field-quantity">
				数量
				<input id="field-quantity" v-model="form.quantity" name="quantity" type="number" inputmode="decimal" autocomplete="off" min="0" :disabled="submitting" />
			</label>
			<label for="field-unit">
				单位
				<input id="field-unit" v-model="form.unit" name="unit" autocomplete="off" :disabled="submitting" />
			</label>
			<label for="field-target_price">
				目标价格
				<input id="field-target_price" v-model="form.target_price" name="target_price" type="number" inputmode="decimal" autocomplete="off" min="0" step="0.01" :disabled="submitting" />
			</label>
			<label for="field-expected_quote_at">
				期望报价时间
				<input id="field-expected_quote_at" v-model="form.expected_quote_at" name="expected_quote_at" type="datetime-local" :disabled="submitting" />
			</label>
			<label for="field-priority">
				优先级
				<select id="field-priority" v-model="form.priority" name="priority" :disabled="submitting">
					<option v-for="p in priorities" :key="p.value" :value="p.value">{{ p.label }}</option>
				</select>
			</label>
			<label for="field-buyer_owner_id">
				指定采购员（留空则自动分配）
				<select id="field-buyer_owner_id" v-model="form.buyer_owner_id" name="buyer_owner_id" :disabled="submitting || buyersLoading">
					<option value="">自动分配</option>
					<option v-for="buyer in buyers" :key="buyer.id" :value="buyer.id">{{ employeeName(buyer) }} / {{ buyer.email }}</option>
				</select>
			</label>
			<TagMultiSelect v-model="form.tags" label="标签" :options="tags" :disabled="submitting" />
			<label for="field-attachments" class="inquiry-form-grid__wide">
				上传文档
				<input id="field-attachments" name="attachments" type="file" multiple :disabled="submitting" @change="handleFiles" />
			</label>
			<label for="field-remark" class="inquiry-form-grid__wide">
				备注
				<textarea id="field-remark" v-model="form.remark" name="remark" rows="3" :disabled="submitting" />
			</label>
		</div>
		<p v-if="uploadError" class="form-message error" role="status" aria-live="polite">{{ uploadError }}</p>
		<div class="form-actions">
			<button type="submit" :disabled="submitting || !canSubmit">{{ submitting ? '创建中...' : '创建询价项' }}</button>
			<button type="button" class="ghost-button" :disabled="submitting" @click="$emit('cancel')">取消</button>
		</div>
	</form>
</template>
