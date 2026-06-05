<template>
	<div class="app-shell">
		<aside class="sidebar">
			<div>
				<p class="eyebrow">Purchase Flow</p>
				<h1>采购报价</h1>
			</div>
			<nav>
				<router-link to="/tasks">我的任务</router-link>
				<router-link to="/customers">客户管理</router-link>
				<router-link to="/suppliers">供应商管理</router-link>
				<router-link to="/inquiry-items">询价项</router-link>
			</nav>
		</aside>
		<main class="content-panel">
			<header class="topbar">
				<div>
					<p class="muted">当前用户</p>
					<strong>{{ auth.userName }}</strong>
				</div>
				<button type="button" class="ghost-button" @click="signOut">退出</button>
			</header>
			<slot />
		</main>
	</div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();

async function signOut() {
	await auth.logout();
	await router.push('/login');
}
</script>
