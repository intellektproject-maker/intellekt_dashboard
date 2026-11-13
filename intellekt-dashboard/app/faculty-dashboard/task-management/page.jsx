'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function TaskManagementContent() {
  const searchParams = useSearchParams();
  const facultyId = searchParams.get('id') || '';
  const batch = searchParams.get('batch') === 'test' ? 'test' : 'regular';
  const isPrivileged = facultyId === 'IG001' || facultyId === 'IG002';

  const options = [
    ...(isPrivileged
      ? [
          {
            title: 'All Faculty Assigned Tasks',
            description: 'View, filter and manage tasks assigned to all faculty members.',
            section: 'allTasks',
            icon: '☷',
          },
          {
            title: 'All Faculty Daily Task',
            description: 'View daily repeated tasks for all faculty.',
            section: 'dailyTasks',
            icon: '▦',
          },
          {
            title: 'Task Assignment',
            description: 'Assign weekly or daily tasks to faculty.',
            section: 'myTasks',
            icon: '＋',
          },
        ]
      : []),
    {
      title: 'My Task Checklist',
      description: 'View, filter and update your assigned tasks.',
      section: 'myChecklist',
      icon: '✓',
    },
  ];

  return (
    <main className="min-h-[80vh] bg-gray-50 px-4 py-8 md:px-8 md:py-10">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-8">
          <Link
            href={`/faculty-dashboard/profile?id=${encodeURIComponent(facultyId)}&batch=${batch}`}
            className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:underline"
          >
            ← Back to Profile
          </Link>
          <h1 className="text-2xl font-bold text-blue-900 md:text-3xl">
            Task Management
          </h1>
          <p className="mt-2 text-gray-600">
            Select the task area you want to open.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {options.map((option) => (
            <Link
              key={option.section}
              href={`/faculty-dashboard/profile?id=${encodeURIComponent(facultyId)}&batch=${batch}&taskSection=${option.section}#task-management`}
              className="group min-h-48 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-md"
            >
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-2xl font-bold text-blue-900">
                {option.icon}
              </div>
              <h2 className="text-lg font-bold text-blue-800">
                {option.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                {option.description}
              </p>
              <span className="mt-5 inline-block text-sm font-semibold text-blue-700">
                Open →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

export default function TaskManagementPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <TaskManagementContent />
    </Suspense>
  );
}
