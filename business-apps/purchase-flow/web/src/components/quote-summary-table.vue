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
		<table v-else class="desktop-table">
			<thead>
				<tr>
					<th scope="col">供应商</th>
					<th scope="col">报价</th>
					<th scope="col">交期</th>
					<th scope="col">报价时间</th>
				</tr>
			</thead>
			<tbody>
				<tr v-for="quote in quotes" :key="quote.id || `${quote.price}-${quote.quoted_at}`">
					<td>{{ supplierName(quote.supplier_id) }}</td>
					<td>{{ quote.price || '-' }} {{ quote.currency || '' }}</td>
					<td>{{ quote.lead_time || '-' }}</td>
					<td>{{ quote.quoted_at || '-' }}</td>
				</tr>
			</tbody>
		</table>
		<ul v-if="quotes.length" class="mobile-table-list" aria-label="供应商报价重点列表">
			<li v-for="quote in quotes" :key="`mobile-${quote.id || `${quote.price}-${quote.quoted_at}`}`" class="mobile-table-item">
				<div class="mobile-table-item__header">
					<strong>{{ supplierName(quote.supplier_id) }}</strong>
					<span>{{ quote.price || '-' }} {{ quote.currency || '' }}</span>
				</div>
				<dl class="mobile-table-meta">
					<div><dt>交期</dt><dd>{{ quote.lead_time || '-' }}</dd></div>
					<div><dt>报价时间</dt><dd>{{ quote.quoted_at || '-' }}</dd></div>
				</dl>
			</li>
		</ul>
	</section>
</template>
