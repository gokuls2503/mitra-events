import {
  BarChart3,
  Briefcase,
  CalendarDays,
  ClipboardList,
  Globe,
  Images,
  LayoutDashboard,
  Package,
  Receipt,
  Users,
  UserCog,
  type LucideIcon,
} from 'lucide-react'

import type { Role } from '@/shared/auth/roles'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  roles: Role[]
  /** Build phase the module ships in; items not yet built render as disabled. */
  phase?: number
  /** Live count shown next to the label. */
  badge?: 'newLeads'
}

const ALL: Role[] = ['OWNER', 'MANAGER', 'STAFF', 'ACCOUNTANT']

// Mirrors the role matrix in the approved plan.
export const NAV: NavItem[] = [
  { label: 'Dashboard', to: '/admin', icon: LayoutDashboard, roles: ALL },
  { label: 'Website content', to: '/admin/website', icon: Globe, roles: ['OWNER', 'MANAGER'] },
  { label: 'Leads & clients', to: '/admin/crm', icon: Briefcase, roles: ['OWNER', 'MANAGER', 'STAFF', 'ACCOUNTANT'], badge: 'newLeads' },
  // Who may use Materials isn't settled yet; change the roles here and in AdminApp's route guard.
  { label: 'Materials', to: '/admin/materials', icon: Package, roles: ['OWNER', 'MANAGER'] },
  { label: 'Gallery', to: '/admin/gallery', icon: Images, roles: ['OWNER', 'MANAGER'] },
  { label: 'Events & bookings', to: '/admin/events', icon: CalendarDays, roles: ALL },
  { label: 'Tasks & vendors', to: '/admin/operations', icon: ClipboardList, roles: ALL },
  { label: 'Accounts & billing', to: '/admin/accounts', icon: Receipt, roles: ['OWNER', 'MANAGER', 'ACCOUNTANT'] },
  { label: 'Business analytics', to: '/admin/analytics', icon: BarChart3, roles: ['OWNER', 'MANAGER', 'ACCOUNTANT'] },
  { label: 'Users', to: '/admin/users', icon: UserCog, roles: ['OWNER'] },
  { label: 'My profile', to: '/admin/profile', icon: Users, roles: ALL },
]
