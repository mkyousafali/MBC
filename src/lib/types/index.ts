// Types for MBC One OS

export interface MenuItem {
	id: string;
	name: string;
	description: string;
	price: number;
	category: string;
	image?: string;
	isVeg: boolean;
	isPopular?: boolean;
}

export interface Offer {
	id: string;
	title: string;
	description: string;
	validity: string;
	discount: string;
	code?: string;
}

export interface Order {
	id: string;
	items: OrderItem[];
	total: number;
	status: OrderStatus;
	date: string;
	time: string;
}

export interface OrderItem {
	menuItem: MenuItem;
	quantity: number;
}

export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';

export interface Customer {
	id: string;
	name: string;
	mobile: string;
	email?: string;
	loyaltyPoints: number;
	addresses: Address[];
}

export interface Address {
	id: string;
	label: string;
	address: string;
	isDefault: boolean;
}

export interface Employee {
	id: string;
	name: string;
	role: string;
	mobile: string;
	email: string;
	status: 'active' | 'inactive';
	shift: string;
}

export interface Task {
	id: string;
	title: string;
	assignee: string;
	status: 'pending' | 'in-progress' | 'completed';
	priority: 'low' | 'medium' | 'high';
	dueTime: string;
}

export interface StockItem {
	id: string;
	name: string;
	quantity: number;
	unit: string;
	minLevel: number;
	status: 'ok' | 'low' | 'critical';
}

export interface DashboardStat {
	label: string;
	value: string;
	change?: string;
	changeType?: 'positive' | 'negative' | 'neutral';
	icon: string;
}

export interface Transaction {
	id: string;
	orderId: string;
	customer: string;
	amount: number;
	method: string;
	time: string;
	status: string;
}

export interface Supplier {
	id: string;
	name: string;
	contact: string;
	email: string;
	items: string;
	status: 'active' | 'inactive';
}

export interface Expense {
	id: string;
	category: string;
	description: string;
	amount: number;
	date: string;
	status: 'approved' | 'pending' | 'rejected';
}

export interface NavItem {
	label: string;
	href: string;
	icon: string;
}

export interface Notification {
	id: string;
	title: string;
	message: string;
	time: string;
	read: boolean;
	type: 'info' | 'warning' | 'success' | 'error';
}
