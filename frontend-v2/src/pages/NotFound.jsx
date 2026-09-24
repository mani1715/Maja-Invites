import Placeholder from './_Placeholder';
import useSeo from '@/lib/useSeo';

export default function NotFound() {
  useSeo({ title: 'Page not found', description: 'That page does not exist.', noindex: true });
  return <Placeholder title="404 — Not Found" route="*" />;
}
