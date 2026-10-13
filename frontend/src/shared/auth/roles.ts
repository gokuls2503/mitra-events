export const ROLES = ['OWNER', 'MANAGER', 'STAFF', 'ACCOUNTANT'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  STAFF: 'Staff',
  ACCOUNTANT: 'Accountant',
}

export interface AuthUser {
  id: number
  email: string
  full_name: string
  phone: string
  role: Role
}
