import { Link } from 'react-router';
import { ROUTES } from '../../router';

export function NotFoundPage() {
  return (
    <div className="text-center py-16">
      <h1 className="text-4xl font-bold text-stone-800">404</h1>
      <p className="mt-2 text-stone-600">页面不存在</p>
      <Link
        to={ROUTES.HOME}
        className="mt-6 inline-block text-stone-700 underline hover:text-stone-900"
      >
        返回首页
      </Link>
    </div>
  );
}
