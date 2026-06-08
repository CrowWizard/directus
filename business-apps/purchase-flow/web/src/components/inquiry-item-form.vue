<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { listCustomers } from '../api/purchase-flow';
import type { Customer } from '../types/purchase-flow';

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
const customersLoading = ref(false);

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
	priority: 'Normal' as Priority,
	buyer_owner_id: '' as string,
	remark: '',
	tags: '',
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
	form.priority = 'Normal';
	form.buyer_owner_id = '';
	form.remark = '';
	form.tags = '';
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
	if (form.buyer_owner_id) payload.buyer_owner_id = form.buyer_owner_id;
	if (form.remark.trim()) payload.remark = form.remark.trim();
	if (form.tags.trim()) payload.tags = form.tags.trim();

	emit('submit', payload);
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

loadCustomers();
</script>

<template>
	<form class="entity-form" :aria-busy="submitting ? 'true' : undefined" @submit.prevent="submit">
		<h3>新增询价项</h3>
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
		<div class="form-row">
			<label for="field-quantity">
				数量
				<input id="field-quantity" v-model="form.quantity" name="quantity" type="number" inputmode="decimal" autocomplete="off" min="0" :disabled="submitting" />
			</label>
			<label for="field-unit">
				单位
				<input id="field-unit" v-model="form.unit" name="unit" autocomplete="off" :disabled="submitting" />
			</label>
		</div>
		<label for="field-target_price">
			目标价格
			<input id="field-target_price" v-model="form.target_price" name="target_price" type="number" inputmode="decimal" autocomplete="off" min="0" step="0.01" :disabled="submitting" />
		</label>
		<label for="field-priority">
			优先级
			<select id="field-priority" v-model="form.priority" name="priority" :disabled="submitting">
				<option v-for="p in priorities" :key="p.value" :value="p.value">{{ p.label }}</option>
			</select>
		</label>
		<label for="field-buyer_owner_id">
			指定采购员（留空则自动分配）
			<input id="field-buyer_owner_id" v-model="form.buyer_owner_id" name="buyer_owner_id" autocomplete="off" :disabled="submitting" placeholder="采购员用户 ID" />
		</label>
		<label for="field-tags">
			标签（逗号分隔）
			<input id="field-tags" v-model="form.tags" name="tags" autocomplete="off" :disabled="submitting" placeholder="electronics,connector" />
		</label>
		<label for="field-remark">
			备注
			<textarea id="field-remark" v-model="form.remark" name="remark" rows="3" :disabled="submitting" />
		</label>
		<div class="form-actions">
			<button type="submit" :disabled="submitting || !canSubmit">{{ submitting ? '创建中...' : '创建询价项' }}</button>
			<button type="button" class="ghost-button" :disabled="submitting" @click="$emit('cancel')">取消</button>
		</div>
	</form>
</template>
