import { createRouter, createWebHistory } from 'vue-router';

import { useAuthStore } from './stores/auth';
import CustomersView from './views/customers-view.vue';
import LoginView from './views/login-view.vue';
import SuppliersView from './views/suppliers-view.vue';
import TasksView from './views/tasks-view.vue';

export const router = createRouter({
	history: createWebHistory(),
	routes: [
		{ path: '/', redirect: '/tasks' },
		{ path: '/login', component: LoginView, meta: { public: true } },
		{ path: '/customers', component: CustomersView },
		{ path: '/suppliers', component: SuppliersView },
		{ path: '/tasks', component: TasksView },
	],
});

router.beforeEach((to) => {
	const auth = useAuthStore();

	if (!to.meta.public && !auth.isAuthenticated) return '/login';
	if (to.path === '/login' && auth.isAuthenticated) return '/tasks';

	return true;
});
