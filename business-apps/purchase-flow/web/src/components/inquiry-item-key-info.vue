<script setup lang="ts">
import type { InquiryItem } from '../types/purchase-flow';

defineProps<{ item: InquiryItem }>();
</script>

<template>
	<section class="info-card">
		<h3>询价项重点信息</h3>
		<dl class="meta-grid">
			<div>
				<dt>询价号</dt>
				<dd>{{ item.inquiry_no || item.id }}</dd>
			</div>
			<div>
				<dt>产品</dt>
				<dd>{{ item.product_name || item.inquiry_item_name || '-' }}</dd>
			</div>
			<div>
				<dt>品牌</dt>
				<dd>{{ item.brand || '-' }}</dd>
			</div>
			<div>
				<dt>状态</dt>
				<dd>{{ item.state }}</dd>
			</div>
			<div>
				<dt>优先级</dt>
				<dd>{{ item.priority || '-' }}</dd>
			</div>
			<div>
				<dt>截止时间</dt>
				<dd>{{ item.assignment_deadline || '-' }}</dd>
			</div>
		</dl>
	</section>
</template>
