import { redirect } from 'next/navigation'

/** `/admin` is the admin dashboard's address; its first section is club verification. */
export default function AdminIndex() {
  redirect('/admin/verification')
}
