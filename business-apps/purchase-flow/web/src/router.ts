import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from './stores/auth';
import AcceptAssignmentView from './views/accept-assignment-view.vue';
import CustomerCreateView from './views/customer-create-view.vue';
import CustomerEditView from './views/customer-edit-view.vue';
import CustomersView from './views/customers-view.vue';
import InquiryItemDetailView from './views/inquiry-item-detail-view.vue';
import InquiryItemSummaryView from './views/inquiry-item-summary-view.vue';
import InquiryItemsView from './views/inquiry-items-view.vue';
import LoginView from './views/login-view.vue';
import SupplierCreateView from './views/supplier-create-view.vue';
import SupplierEditView from './views/supplier-edit-view.vue';
import SuppliersView from './views/suppliers-view.vue';
import TasksView from './views/tasks-view.vue';

export const router = createRouter({
	history: createWebHistory(),
	routes: [
		{ path: '/', redirect: '/tasks' },
		{ path: '/login', component: LoginView, meta: { public: true } },
		{ path: '/purchase-flow-accept/accept', component: AcceptAssignmentView },
		{ path: '/customers', component: CustomersView },
		{ path: '/customers/new', component: CustomerCreateView },
		{ path: '/customers/:id/edit', component: CustomerEditView },
		{ path: '/inquiry-items', component: InquiryItemsView },
		{ path: '/inquiry-items/:id', component: InquiryItemSummaryView },
		{ path: '/inquiry-items/:id/detail', component: InquiryItemDetailView },
		{ path: '/suppliers', component: SuppliersView },
		{ path: '/suppliers/new', component: SupplierCreateView },
		{ path: '/suppliers/:id/edit', component: SupplierEditView },
		{ path: '/tasks', component: TasksView },
	],
});

router.beforeEach((to) => {
	const auth = useAuthStore();

	if (!to.meta.public && !auth.isAuthenticated) {
		return { path: '/login', query: { redirect: to.fullPath } };
	}

	if (to.path === '/login' && auth.isAuthenticated) return '/tasks';

	return true;
});
