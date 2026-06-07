import { redirect } from 'next/navigation';

// Root route → immediately go to the dashboard
export default function Home() {
  redirect('/dashboard');
}
