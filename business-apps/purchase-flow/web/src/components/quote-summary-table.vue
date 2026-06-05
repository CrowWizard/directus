<script setup lang="ts">
import type { Supplier, SupplierQuote } from '../types/purchase-flow';

defineProps<{ quotes: SupplierQuote[] }>();

function supplierName(supplier: SupplierQuote['supplier_id']) {
	if (!supplier) return '-';
	if (typeof supplier === 'string') return supplier;

	return (supplier as Supplier).supplier_name || (supplier as Supplier).supplier_code || '-';
}
</script>

<template>
	<section class="info-card">
		<h3>供应商报价重点</h3>
		<p v-if="quotes.length === 0" class="muted">暂无供应商报价。</p>
		<table v-else>
			<thead>
				<tr>
					<th>供应商</th>
					<th>报价</th>
					<th>MOQ</th>
					<th>交期</th>
					<th>报价时间</th>
				</tr>
			</thead>
			<tbody>
				<tr v-for="quote in quotes" :key="quote.id || `${quote.price}-${quote.quoted_at}`">
					<td>{{ supplierName(quote.supplier_id) }}</td>
					<td>{{ quote.price || '-' }} {{ quote.currency || '' }}</td>
					<td>{{ quote.moq || '-' }}</td>
					<td>{{ quote.lead_time || '-' }}</td>
					<td>{{ quote.quoted_at || '-' }}</td>
				</tr>
			</tbody>
		</table>
	</section>
</template>
