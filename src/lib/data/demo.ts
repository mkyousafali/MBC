import type {
	MenuItem, Offer, Order, Customer, Employee, Task,
	StockItem, DashboardStat, Transaction, Supplier, Expense, Notification
} from '$lib/types';

export const menuItems: MenuItem[] = [
	{
		id: '1', name: 'Chicken Biriyani', description: 'Authentic Malabar-style chicken biriyani with aromatic spices and tender chicken pieces',
		price: 220, category: 'Biriyani', isVeg: false, isPopular: true
	},
	{
		id: '2', name: 'Beef Biriyani', description: 'Slow-cooked beef with fragrant basmati rice and traditional Malabar spices',
		price: 250, category: 'Biriyani', isVeg: false, isPopular: true
	},
	{
		id: '3', name: 'Mutton Biriyani', description: 'Premium mutton biriyani prepared with hand-ground masala and saffron rice',
		price: 300, category: 'Biriyani', isVeg: false, isPopular: true
	},
	{
		id: '4', name: 'Fish Biriyani', description: 'Fresh fish biriyani with coastal spices and coconut-infused rice',
		price: 260, category: 'Biriyani', isVeg: false
	},
	{
		id: '5', name: 'Family Combo', description: 'Serves 4 — Chicken biriyani, salad, raita and dessert',
		price: 799, category: 'Combos', isVeg: false, isPopular: true
	},
	{
		id: '6', name: 'Special Malabar Meals', description: 'Traditional Kerala meals with rice, sambar, rasam, avial and payasam',
		price: 180, category: 'Meals', isVeg: true
	},
	{
		id: '7', name: 'Egg Biriyani', description: 'Flavourful egg biriyani with boiled eggs and aromatic rice',
		price: 160, category: 'Biriyani', isVeg: false
	},
	{
		id: '8', name: 'Veg Biriyani', description: 'Garden-fresh vegetables cooked with basmati rice and whole spices',
		price: 150, category: 'Biriyani', isVeg: true
	},
	{
		id: '9', name: 'Chicken Kebab', description: 'Smoky grilled chicken kebabs marinated in yoghurt and spices',
		price: 180, category: 'Starters', isVeg: false
	},
	{
		id: '10', name: 'Pathiri & Chicken Curry', description: 'Soft rice pathiri served with rich Malabar chicken curry',
		price: 200, category: 'Meals', isVeg: false
	}
];

export const menuCategories = ['All', 'Biriyani', 'Meals', 'Combos', 'Starters', 'Desserts', 'Drinks'];

export const offers: Offer[] = [
	{
		id: '1', title: '20% Off on Family Combos', description: 'Enjoy 20% discount on all family combo meals this weekend',
		validity: 'Valid till Sunday', discount: '20%', code: 'FAMILY20'
	},
	{
		id: '2', title: 'Free Dessert with Biriyani', description: 'Get a complimentary dessert with any biriyani order above ₹250',
		validity: 'Valid this week', discount: 'Free Dessert', code: 'SWEET250'
	},
	{
		id: '3', title: 'Lunch Special — ₹149', description: 'Special lunch meals starting at just ₹149 from 12 PM to 3 PM',
		validity: 'Monday to Friday', discount: '₹149', code: 'LUNCH149'
	}
];

export const recentOrders: Order[] = [
	{
		id: 'ORD-1024', items: [{ menuItem: menuItems[0], quantity: 2 }],
		total: 440, status: 'delivered', date: '2026-07-19', time: '7:30 PM'
	},
	{
		id: 'ORD-1023', items: [{ menuItem: menuItems[4], quantity: 1 }],
		total: 799, status: 'delivered', date: '2026-07-18', time: '1:15 PM'
	},
	{
		id: 'ORD-1022', items: [{ menuItem: menuItems[2], quantity: 1 }, { menuItem: menuItems[8], quantity: 2 }],
		total: 660, status: 'delivered', date: '2026-07-17', time: '8:00 PM'
	}
];

export const currentCustomer: Customer = {
	id: 'C001', name: 'Rahul Krishnan', mobile: '+91 98765 43210', email: 'rahul@example.com',
	loyaltyPoints: 450,
	addresses: [
		{ id: 'A1', label: 'Home', address: '24 MG Road, Kozhikode, Kerala 673001', isDefault: true },
		{ id: 'A2', label: 'Office', address: '5th Floor, Cyber Tower, Kozhikode, Kerala 673016', isDefault: false }
	]
};

export const currentEmployee: Employee = {
	id: 'E001', name: 'Arjun Nair', role: 'Floor Manager', mobile: '+91 99887 76655',
	email: 'arjun@mbc.com', status: 'active', shift: 'Morning (9 AM — 5 PM)'
};

export const employees: Employee[] = [
	{ id: 'E001', name: 'Arjun Nair', role: 'Floor Manager', mobile: '+91 99887 76655', email: 'arjun@mbc.com', status: 'active', shift: 'Morning' },
	{ id: 'E002', name: 'Priya Menon', role: 'Head Chef', mobile: '+91 99887 76656', email: 'priya@mbc.com', status: 'active', shift: 'Morning' },
	{ id: 'E003', name: 'Faisal K', role: 'Cashier', mobile: '+91 99887 76657', email: 'faisal@mbc.com', status: 'active', shift: 'Evening' },
	{ id: 'E004', name: 'Deepa S', role: 'Waitstaff', mobile: '+91 99887 76658', email: 'deepa@mbc.com', status: 'active', shift: 'Morning' },
	{ id: 'E005', name: 'Rajan P', role: 'Kitchen Staff', mobile: '+91 99887 76659', email: 'rajan@mbc.com', status: 'inactive', shift: 'Night' }
];

export const tasks: Task[] = [
	{ id: 'T1', title: 'Restock chicken inventory', assignee: 'Rajan P', status: 'pending', priority: 'high', dueTime: '11:00 AM' },
	{ id: 'T2', title: 'Clean dining area tables', assignee: 'Deepa S', status: 'in-progress', priority: 'medium', dueTime: '10:30 AM' },
	{ id: 'T3', title: 'Prepare lunch specials', assignee: 'Priya Menon', status: 'in-progress', priority: 'high', dueTime: '11:30 AM' },
	{ id: 'T4', title: 'Update menu board prices', assignee: 'Faisal K', status: 'completed', priority: 'low', dueTime: '9:00 AM' },
	{ id: 'T5', title: 'Check delivery orders', assignee: 'Arjun Nair', status: 'pending', priority: 'medium', dueTime: '12:00 PM' }
];

export const stockItems: StockItem[] = [
	{ id: 'S1', name: 'Basmati Rice', quantity: 45, unit: 'kg', minLevel: 20, status: 'ok' },
	{ id: 'S2', name: 'Chicken', quantity: 8, unit: 'kg', minLevel: 15, status: 'low' },
	{ id: 'S3', name: 'Cooking Oil', quantity: 3, unit: 'L', minLevel: 10, status: 'critical' },
	{ id: 'S4', name: 'Onions', quantity: 30, unit: 'kg', minLevel: 10, status: 'ok' },
	{ id: 'S5', name: 'Mutton', quantity: 5, unit: 'kg', minLevel: 8, status: 'low' },
	{ id: 'S6', name: 'Spice Mix', quantity: 12, unit: 'kg', minLevel: 5, status: 'ok' }
];

export const dashboardStats: DashboardStat[] = [
	{ label: "Today's Sales", value: '₹24,580', change: '+12%', changeType: 'positive', icon: '₹' },
	{ label: 'Total Orders', value: '47', change: '+8%', changeType: 'positive', icon: '📦' },
	{ label: 'Avg Order Value', value: '₹523', change: '+3%', changeType: 'positive', icon: '📊' },
	{ label: 'Pending Orders', value: '6', change: '', changeType: 'neutral', icon: '⏳' },
	{ label: 'Kitchen Queue', value: '4', change: '-2', changeType: 'positive', icon: '🍳' },
	{ label: 'Low Stock Items', value: '3', change: '+1', changeType: 'negative', icon: '📉' },
	{ label: 'Staff Present', value: '8/12', change: '', changeType: 'neutral', icon: '👥' },
	{ label: 'Customer Count', value: '112', change: '+15%', changeType: 'positive', icon: '🧑' }
];

export const transactions: Transaction[] = [
	{ id: 'TXN-501', orderId: 'ORD-1024', customer: 'Rahul K', amount: 440, method: 'UPI', time: '7:30 PM', status: 'completed' },
	{ id: 'TXN-500', orderId: 'ORD-1023', customer: 'Anita S', amount: 799, method: 'Card', time: '1:15 PM', status: 'completed' },
	{ id: 'TXN-499', orderId: 'ORD-1022', customer: 'Mohan R', amount: 660, method: 'Cash', time: '12:45 PM', status: 'completed' },
	{ id: 'TXN-498', orderId: 'ORD-1021', customer: 'Zara M', amount: 520, method: 'UPI', time: '12:00 PM', status: 'completed' },
	{ id: 'TXN-497', orderId: 'ORD-1020', customer: 'Vikram P', amount: 300, method: 'Cash', time: '11:30 AM', status: 'completed' }
];

export const suppliers: Supplier[] = [
	{ id: 'SUP-1', name: 'Fresh Farms Kerala', contact: '+91 94567 12345', email: 'fresh@farms.com', items: 'Vegetables, Fruits', status: 'active' },
	{ id: 'SUP-2', name: 'Kerala Meats Co', contact: '+91 94567 12346', email: 'info@keralameats.com', items: 'Chicken, Mutton, Beef', status: 'active' },
	{ id: 'SUP-3', name: 'Spice Garden', contact: '+91 94567 12347', email: 'orders@spicegarden.com', items: 'Spices, Masala', status: 'active' },
	{ id: 'SUP-4', name: 'Coast Fish Traders', contact: '+91 94567 12348', email: 'fish@coast.com', items: 'Fish, Seafood', status: 'inactive' }
];

export const expenses: Expense[] = [
	{ id: 'EXP-1', category: 'Ingredients', description: 'Weekly vegetable purchase', amount: 8500, date: '2026-07-19', status: 'approved' },
	{ id: 'EXP-2', category: 'Utilities', description: 'Electricity bill — July', amount: 12000, date: '2026-07-15', status: 'approved' },
	{ id: 'EXP-3', category: 'Maintenance', description: 'Kitchen equipment repair', amount: 3500, date: '2026-07-14', status: 'pending' },
	{ id: 'EXP-4', category: 'Ingredients', description: 'Meat and poultry order', amount: 15000, date: '2026-07-13', status: 'approved' }
];

export const notifications: Notification[] = [
	{ id: 'N1', title: 'Low Stock Alert', message: 'Cooking oil is below minimum level', time: '10 min ago', read: false, type: 'warning' },
	{ id: 'N2', title: 'New Order', message: 'Order #1025 received from online', time: '15 min ago', read: false, type: 'info' },
	{ id: 'N3', title: 'Task Completed', message: 'Menu board prices updated by Faisal', time: '30 min ago', read: true, type: 'success' },
	{ id: 'N4', title: 'Shift Reminder', message: 'Evening shift starts in 1 hour', time: '1 hr ago', read: true, type: 'info' }
];

export const kitchenOrders = [
	{ id: 'ORD-1025', items: ['Chicken Biriyani x2', 'Mutton Biriyani x1'], status: 'preparing', time: '5 min ago', priority: 'normal' as const },
	{ id: 'ORD-1026', items: ['Family Combo x1'], status: 'pending', time: '2 min ago', priority: 'high' as const },
	{ id: 'ORD-1027', items: ['Fish Biriyani x1', 'Chicken Kebab x2'], status: 'preparing', time: '8 min ago', priority: 'normal' as const },
	{ id: 'ORD-1028', items: ['Veg Biriyani x3', 'Special Malabar Meals x2'], status: 'ready', time: '15 min ago', priority: 'normal' as const }
];

export const popularItems = [
	{ name: 'Chicken Biriyani', orders: 156, revenue: '₹34,320' },
	{ name: 'Beef Biriyani', orders: 98, revenue: '₹24,500' },
	{ name: 'Family Combo', orders: 67, revenue: '₹53,533' },
	{ name: 'Mutton Biriyani', orders: 54, revenue: '₹16,200' },
	{ name: 'Special Malabar Meals', orders: 45, revenue: '₹8,100' }
];

export const ordersByStatus = [
	{ status: 'Pending', count: 6, color: 'var(--color-warning)' },
	{ status: 'Confirmed', count: 4, color: 'var(--color-info)' },
	{ status: 'Preparing', count: 8, color: 'var(--color-accent)' },
	{ status: 'Ready', count: 3, color: 'var(--color-success)' },
	{ status: 'Delivered', count: 26, color: 'var(--color-primary)' }
];
