'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  'https://responsible-wonder-production.up.railway.app';

function FacultyProfileInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const facultyId = searchParams.get('id');
  const loginFacultyId = searchParams.get('loginId') || facultyId;

  const [faculty, setFaculty] = useState(null);
  const [facultyList, setFacultyList] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [dailyTasks, setDailyTasks] = useState([]);
  const [error, setError] = useState('');
  const [taskLoading, setTaskLoading] = useState(false);
  const [allTaskLoading, setAllTaskLoading] = useState(false);
  const [dailyTaskLoading, setDailyTaskLoading] = useState(false);
  const [myTaskFilter, setMyTaskFilter] = useState('All');
  const [allTaskFilter, setAllTaskFilter] = useState('All');
  const [dailyTaskFilter, setDailyTaskFilter] = useState('All');
  const [classOptions, setClassOptions] = useState([]);
  const [testCodes, setTestCodes] = useState([]);
  const [facultyNotifications, setFacultyNotifications] = useState([]);
  const [activeSection, setActiveSection] = useState('');
  const [manageModalOpen, setManageModalOpen] = useState(false);
  const selectedBatch = searchParams.get('batch') === 'test' ? 'Test Batch' : 'Regular Batch';

  useEffect(() => {
    const requestedSection = searchParams.get('taskSection');
    const allowedSections = ['allTasks', 'dailyTasks', 'myTasks', 'myChecklist'];
    if (requestedSection && allowedSections.includes(requestedSection)) {
      setActiveSection(requestedSection);
    }
  }, [searchParams]);

  function handleBatchChange(batch) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('id', facultyId || '');
    params.set('batch', batch === 'Test Batch' ? 'test' : 'regular');
    router.replace('/faculty-dashboard/profile?' + params.toString());
  }

  const canAccessAllTasks =
    loginFacultyId === 'IG001' || loginFacultyId === 'IG002';

  const profileTitle = canAccessAllTasks ? 'Admin Profile' : 'Faculty Profile';

  const priorityOptions = ['High', 'Medium', 'Low'];
  const taskTypeOptions = ['Weekly', 'Daily'];

  const [form, setForm] = useState({
    faculty_id: '',
    faculty_name: '',
    class_name: '',
    subject_name: '',
    total_test_note: '',
    other_tasks: '',
    due_date: '',
    priority: 'Medium',
    task_type: 'Weekly',
  });

  async function safeFetchJson(url, options = {}) {
    const res = await fetch(url, options);
    const text = await res.text();

    let data;

    try {
      data = text ? JSON.parse(text) : {};
    } catch (err) {
      console.error('Non-JSON response from:', url);
      console.error('Response text:', text);
      throw new Error(`Backend did not return JSON for ${url}`);
    }

    if (!res.ok) {
      throw new Error(
        (data && (data.details || data.error)) || 'Request failed'
      );
    }

    return data;
  }

  function hasFacultyNotification(moduleName) {
    return facultyNotifications.some(
      (item) => item.module_name === moduleName
    );
  }

  function clearFacultyNotification(moduleName) {
    setFacultyNotifications((prev) =>
      prev.filter((item) => item.module_name !== moduleName)
    );
  }

  async function markFacultyNotificationRead(moduleName) {
    try {
      if (!facultyId) return;

      await fetch(
        `${API_BASE}/faculty-notifications/mark-read/${facultyId}/${moduleName}`,
        { method: 'PUT' }
      );

      clearFacultyNotification(moduleName);
    } catch (err) {
      console.error(err);
      clearFacultyNotification(moduleName);
    }
  }

  function isOverdue(task) {
    if (!task.due_date || task.is_completed) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const due = new Date(task.due_date);
    due.setHours(0, 0, 0, 0);

    return due < today;
  }

  function isDueToday(task) {
    if (!task.due_date || task.is_completed) return false;

    const today = new Date();
    const due = new Date(task.due_date);

    return (
      today.getFullYear() === due.getFullYear() &&
      today.getMonth() === due.getMonth() &&
      today.getDate() === due.getDate()
    );
  }

  function getTaskCardClass(task) {
    if (task.task_type === 'Daily') {
      return 'rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm';
    }

    if (isOverdue(task)) {
      return 'rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm';
    }

    if (isDueToday(task)) {
      return 'rounded-xl border border-yellow-200 bg-yellow-50 p-4 shadow-sm';
    }

    return 'rounded-xl border p-4 shadow-sm bg-gray-50';
  }

  function applyTaskFilter(taskList, filterValue) {
    if (filterValue === 'Pending') {
      return taskList.filter((task) => !task.is_completed);
    }

    if (filterValue === 'Completed') {
      return taskList.filter((task) => task.is_completed);
    }

    if (filterValue === 'Overdue') {
      return taskList.filter((task) => isOverdue(task));
    }

    if (filterValue === 'Due Today') {
      return taskList.filter((task) => isDueToday(task));
    }

    return taskList;
  }

  useEffect(() => {
    async function fetchFaculty() {
      try {
        const data = await safeFetchJson(`${API_BASE}/faculty/${facultyId}`);

        setFaculty(data);

        setForm((prev) => ({
          ...prev,
          faculty_id: data.faculty_id || '',
          faculty_name: data.name || '',
        }));
      } catch (err) {
        console.error(err);
        setError(err.message || 'Unable to load faculty details');
      }
    }

    if (facultyId) {
      fetchFaculty();
    }
  }, [facultyId]);

  useEffect(() => {
    async function fetchNotifications() {
      try {
        const data = await safeFetchJson(
          `${API_BASE}/faculty-notifications/${facultyId}`
        );

        setFacultyNotifications(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        setFacultyNotifications([]);
      }
    }

    if (facultyId) {
      fetchNotifications();
    }
  }, [facultyId]);

  useEffect(() => {
    async function fetchAllFaculty() {
      try {
        const data = await safeFetchJson(`${API_BASE}/faculty`);
        setFacultyList(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        setFacultyList([]);
      }
    }

    fetchAllFaculty();
  }, []);

  useEffect(() => {
    async function fetchClasses() {
      try {
        const data = await safeFetchJson(`${API_BASE}/classes`);

        const formattedClasses = Array.isArray(data)
          ? data.map((item) => {
              const board = item.board || '';
              const className = item.class || item.class_name || '';

              if (!board || !className) return null;

              return `${board}-${className}`;
            })
          : [];

        const uniqueClasses = [...new Set(formattedClasses.filter(Boolean))];

        setClassOptions([...uniqueClasses, 'Others']);
      } catch (err) {
        console.error(err);
        setClassOptions(['Others']);
      }
    }

    fetchClasses();
  }, []);

  useEffect(() => {
    async function fetchTestCodes() {
      try {
        const data = await safeFetchJson(`${API_BASE}/tests`);
        setTestCodes(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        setTestCodes([]);
      }
    }

    fetchTestCodes();
  }, []);

  useEffect(() => {
    async function fetchMyTasks() {
      try {
        setTaskLoading(true);

        const data = await safeFetchJson(
          `${API_BASE}/faculty-tasks/${facultyId}`
        );

        setTasks(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        setTasks([]);
      } finally {
        setTaskLoading(false);
      }
    }

    if (facultyId) {
      fetchMyTasks();
    }
  }, [facultyId]);

  useEffect(() => {
    async function fetchAllFacultyTasks() {
      if (!canAccessAllTasks) return;

      try {
        setAllTaskLoading(true);

        const data = await safeFetchJson(
          `${API_BASE}/faculty-tasks-all?loginFacultyId=${loginFacultyId}`
        );

        setAllTasks(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        setAllTasks([]);
      } finally {
        setAllTaskLoading(false);
      }
    }

    fetchAllFacultyTasks();
  }, [loginFacultyId, canAccessAllTasks]);

  useEffect(() => {
    async function fetchDailyTasks() {
      if (!canAccessAllTasks) return;

      try {
        setDailyTaskLoading(true);

        const data = await safeFetchJson(
          `${API_BASE}/faculty-daily-tasks-all?loginFacultyId=${loginFacultyId}`
        );

        setDailyTasks(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        setDailyTasks([]);
      } finally {
        setDailyTaskLoading(false);
      }
    }

    fetchDailyTasks();
  }, [loginFacultyId, canAccessAllTasks]);

  async function refreshMyTasks() {
    try {
      if (!facultyId) return;

      const data = await safeFetchJson(`${API_BASE}/faculty-tasks/${facultyId}`);
      setTasks(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setTasks([]);
    }
  }

  async function refreshAllFacultyTasks() {
    if (!canAccessAllTasks) return;

    try {
      const data = await safeFetchJson(
        `${API_BASE}/faculty-tasks-all?loginFacultyId=${loginFacultyId}`
      );

      setAllTasks(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setAllTasks([]);
    }
  }

  async function refreshDailyTasks() {
    if (!canAccessAllTasks) return;

    try {
      const data = await safeFetchJson(
        `${API_BASE}/faculty-daily-tasks-all?loginFacultyId=${loginFacultyId}`
      );

      setDailyTasks(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setDailyTasks([]);
    }
  }

  function handleFacultyChange(e) {
    const selectedId = e.target.value;
    const selectedFaculty = facultyList.find(
      (f) => f.faculty_id === selectedId
    );

    setForm((prev) => ({
      ...prev,
      faculty_id: selectedId,
      faculty_name: selectedFaculty ? selectedFaculty.name : '',
    }));
  }

  function handleInputChange(e) {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'task_type' && value === 'Daily'
        ? { due_date: '', priority: 'High' }
        : {}),
      ...(name === 'task_type' && value === 'Weekly'
        ? { priority: 'Medium' }
        : {}),
    }));
  }

  async function handleAssignTask(e) {
    e.preventDefault();

    if (taskLoading) return;

    if (!form.faculty_id || !form.faculty_name || !form.class_name) {
      alert('Please fill Faculty Name and Class');
      return;
    }

    if (!form.subject_name && !form.other_tasks.trim()) {
      alert('Please select Test Code or enter Other Tasks');
      return;
    }

    if (form.task_type === 'Weekly' && !form.due_date) {
      alert('Please select Due Date for Weekly Task');
      return;
    }

    if (form.task_type === 'Weekly') {
      const today = new Date().toISOString().split('T')[0];

      if (form.due_date < today) {
        alert('Past due dates are not allowed');
        return;
      }
    }

    try {
      setTaskLoading(true);

      const data = await safeFetchJson(`${API_BASE}/faculty-tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          loginFacultyId,
          faculty_id: form.faculty_id,
          faculty_name: form.faculty_name,
          class_name: form.class_name,
          subject_name: form.subject_name,
          total_test_note: form.total_test_note,
          other_tasks: form.other_tasks,
          due_date: form.task_type === 'Daily' ? null : form.due_date,
          priority: form.task_type === 'Daily' ? 'High' : form.priority,
          task_type: form.task_type,
        }),
      });

      alert(data.message || 'Task assigned successfully');

      setForm((prev) => ({
        ...prev,
        class_name: '',
        subject_name: '',
        total_test_note: '',
        other_tasks: '',
        due_date: '',
        priority: 'Medium',
        task_type: 'Weekly',
      }));

      await refreshMyTasks();
      await refreshAllFacultyTasks();
      await refreshDailyTasks();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to assign task');
    } finally {
      setTaskLoading(false);
    }
  }

  async function handleToggleTask(taskId, currentStatus) {
    try {
      await safeFetchJson(`${API_BASE}/faculty-tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          is_completed: !currentStatus,
        }),
      });

      await refreshMyTasks();
      await refreshAllFacultyTasks();
      await refreshDailyTasks();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to update task');
    }
  }

  async function handleDeleteTask(taskId) {
    const ok = confirm('Are you sure you want to delete this task?');

    if (!ok) return;

    try {
      await safeFetchJson(
        `${API_BASE}/faculty-tasks/${taskId}?loginFacultyId=${loginFacultyId}`,
        {
          method: 'DELETE',
        }
      );

      alert('Task deleted successfully');

      await refreshMyTasks();
      await refreshAllFacultyTasks();
      await refreshDailyTasks();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to delete task');
    }
  }

  async function handleReassignTask(task) {
    const newFacultyId = prompt('Enter new Faculty ID (e.g. IG002):')
      ?.trim()
      .toUpperCase();

    if (!newFacultyId) return;

    const selectedFaculty = facultyList.find(
      (f) => String(f.faculty_id).toUpperCase() === newFacultyId
    );

    if (!selectedFaculty) {
      alert('Invalid Faculty ID');
      return;
    }

    if (newFacultyId === String(task.faculty_id).toUpperCase()) {
      alert('Task already assigned to this faculty');
      return;
    }

    try {
      await safeFetchJson(`${API_BASE}/faculty-tasks/${task.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          faculty_id: newFacultyId,
          faculty_name: selectedFaculty.name,
        }),
      });

      alert('Task reassigned successfully');

      await refreshMyTasks();
      await refreshAllFacultyTasks();
      await refreshDailyTasks();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to reassign task');
    }
  }

  const myStats = useMemo(() => {
    return {
      pending: tasks.filter((task) => !task.is_completed).length,
      completed: tasks.filter((task) => task.is_completed).length,
      overdue: tasks.filter((task) => isOverdue(task)).length,
      dueToday: tasks.filter((task) => isDueToday(task)).length,
    };
  }, [tasks]);

  const allStats = useMemo(() => {
    return {
      pending: allTasks.filter((task) => !task.is_completed).length,
      completed: allTasks.filter((task) => task.is_completed).length,
      overdue: allTasks.filter((task) => isOverdue(task)).length,
      dueToday: allTasks.filter((task) => isDueToday(task)).length,
    };
  }, [allTasks]);

  const dailyStats = useMemo(() => {
    return {
      pending: dailyTasks.filter((task) => !task.is_completed).length,
      completed: dailyTasks.filter((task) => task.is_completed).length,
      overdue: dailyTasks.filter((task) => isOverdue(task)).length,
      dueToday: dailyTasks.filter((task) => isDueToday(task)).length,
    };
  }, [dailyTasks]);

  const filteredMyTasks = useMemo(() => {
    return applyTaskFilter(tasks, myTaskFilter);
  }, [tasks, myTaskFilter]);

  const filteredAllTasks = useMemo(() => {
    return applyTaskFilter(allTasks, allTaskFilter);
  }, [allTasks, allTaskFilter]);

  const filteredDailyTasks = useMemo(() => {
    return applyTaskFilter(dailyTasks, dailyTaskFilter);
  }, [dailyTasks, dailyTaskFilter]);

  function renderTaskDetails(task, showType = false) {
    return (
      <div className="space-y-1 text-gray-700">
        <p className="font-medium text-gray-800">
          {task.faculty_name} ({task.faculty_id})
        </p>

        <p>
          <b>Class:</b> {task.class_name}
        </p>

        {showType && (
          <p>
            <b>Task Type:</b> {task.task_type || 'Weekly'}
          </p>
        )}

        <p>
          <b>Priority:</b> {task.priority || 'Medium'}
        </p>

        <p>
          <b>Test Code:</b> {task.subject_name || '-'}
        </p>

        <p>
          <b>Total Test Note:</b> {task.total_test_note || '-'}
        </p>

        <p>
          <b>Due Date:</b>{' '}
          {task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}
        </p>

        <p>
          <b>Other Tasks:</b> {task.other_tasks || '-'}
        </p>

        {task.is_completed && (
          <p className="font-semibold text-green-700">
            Completed
            {task.completed_at
              ? ` on ${new Date(task.completed_at).toLocaleDateString()}`
              : ''}
          </p>
        )}

        <p className="text-sm text-gray-500">
          Assigned by: {task.assigned_by}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="text-red-600 font-semibold text-center">{error}</div>
      </div>
    );
  }

  if (!faculty) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="text-gray-700 text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] bg-gray-50 px-6 py-10">
      <div className="mx-auto w-full max-w-6xl">
        <h2 className="mb-6 text-center text-3xl font-bold text-blue-700 md:text-4xl">
          {profileTitle}
        </h2>

        <div className="mb-8 flex justify-center">
          <div
            className="inline-flex w-full max-w-md rounded-full border border-blue-100 bg-white p-1.5 shadow-sm"
            role="group"
            aria-label="Select student batch"
          >
            {['Regular Batch', 'Test Batch'].map((batch) => {
              const isSelected = selectedBatch === batch;

              return (
                <button
                  key={batch}
                  type="button"
                  onClick={() => handleBatchChange(batch)}
                  aria-pressed={isSelected}
                  className={`flex-1 rounded-full px-4 py-3 text-sm font-semibold transition-all duration-200 sm:text-base ${
                    isSelected
                      ? 'bg-blue-700 text-white shadow-md'
                      : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700'
                  }`}
                >
                  {batch}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-8 space-y-4 rounded-2xl bg-white p-6 shadow-md md:p-8">
          <p className="text-gray-700 text-base md:text-lg">
            <b>Faculty ID:</b> {faculty.faculty_id}
          </p>

          <p className="text-gray-700 text-base md:text-lg">
            <b>Name:</b> {faculty.name}
          </p>

          <p className="text-gray-700 text-base md:text-lg">
            <b>Email:</b> {faculty.email}
          </p>

          <p className="text-gray-700 text-base md:text-lg">
            <b>Phone:</b> {faculty.phone}
          </p>
        </div>

        <div className="mb-8">
          <h3 className="mb-5 text-2xl font-bold text-blue-900">
            {selectedBatch === 'Test Batch' ? 'Test Batch Features' : 'Regular Batch Features'}
          </h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              href={
                selectedBatch === 'Test Batch'
                  ? `/faculty-dashboard/test-batch?id=${encodeURIComponent(facultyId)}&section=attendance&batch=test`
                  : `/faculty-dashboard/attendance?id=${encodeURIComponent(facultyId)}&batch=regular`
              }
              className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
            >
              <div className="mb-3 text-2xl text-blue-900">▦</div>
              <h4 className="font-bold text-gray-900">Attendance</h4>
              <p className="mt-1 text-sm text-gray-500">View and manage batch attendance</p>
            </Link>

            <Link
              href={
                selectedBatch === 'Test Batch'
                  ? `/faculty-dashboard/test-batch?id=${encodeURIComponent(facultyId)}&batch=test`
                  : `/faculty-dashboard/test?id=${encodeURIComponent(facultyId)}&batch=regular`
              }
              className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
            >
              <div className="mb-3 text-2xl text-blue-900">▤</div>
              <h4 className="font-bold text-gray-900">Test</h4>
              <p className="mt-1 text-sm text-gray-500">Enter and manage test marks</p>
            </Link>

            {selectedBatch === 'Test Batch' ? (
              <Link
                href={`/faculty-dashboard/manage-test-batch-students?id=${encodeURIComponent(facultyId)}&batch=test`}
                className="rounded-2xl border border-gray-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
              >
                <div className="mb-3 text-2xl text-blue-900">♙</div>
                <h4 className="font-bold text-gray-900">Students</h4>
                <p className="mt-1 text-sm text-gray-500">View and manage Test Batch students</p>
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setManageModalOpen(true)}
                className="rounded-2xl border border-gray-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
              >
                <div className="mb-3 text-2xl text-blue-900">♙</div>
                <h4 className="font-bold text-gray-900">Manage</h4>
                <p className="mt-1 text-sm text-gray-500">Manage students and faculty accounts</p>
              </button>
            )}

            {selectedBatch !== 'Test Batch' && canAccessAllTasks && (
              <Link
                href={`/faculty-dashboard/student-record?id=${encodeURIComponent(facultyId)}&batch=regular`}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
              >
                <div className="mb-3 text-2xl text-blue-900">▣</div>
                <h4 className="font-bold text-gray-900">Student Records</h4>
                <p className="mt-1 text-sm text-gray-500">View student academic records</p>
              </Link>
            )}

            {selectedBatch !== 'Test Batch' && canAccessAllTasks && (
              <Link
                href={`/faculty-dashboard/enquiries?id=${encodeURIComponent(facultyId)}&batch=regular`}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
              >
                <div className="mb-3 text-2xl text-blue-900">✉</div>
                <h4 className="font-bold text-gray-900">Enquiries</h4>
                <p className="mt-1 text-sm text-gray-500">View and manage enquiries</p>
              </Link>
            )}

            {selectedBatch !== 'Test Batch' && /^IG\d{3,}$/.test(facultyId.trim()) && (
              <Link
                href={`/faculty-dashboard/edit-requests?id=${encodeURIComponent(facultyId)}&batch=${selectedBatch === 'Test Batch' ? 'test' : 'regular'}`}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
              >
                <div className="mb-3 text-2xl text-blue-900">☷</div>
                <h4 className="font-bold text-gray-900">Edit Requests</h4>
                <p className="mt-1 text-sm text-gray-500">Review faculty requests to edit attendance and marks</p>
              </Link>
            )}
          </div>
        </div>

        <div id="task-management" className="mb-8 scroll-mt-6" />

        {canAccessAllTasks && activeSection === 'myTasks' && (
          <div className="mb-8 rounded-2xl bg-white p-6 shadow-md md:p-8">
            <h3 className="mb-4 text-xl md:text-2xl font-bold text-blue-700">
              Task Assignment
            </h3>

            <form onSubmit={handleAssignTask} className="space-y-4">
              <div>
                <label className="mb-2 block font-medium text-gray-700">
                  1. Faculty Name
                </label>

                <select
                  value={form.faculty_id}
                  onChange={handleFacultyChange}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-500 text-gray-700"
                >
                  <option value="">Select Faculty</option>

                  {facultyList.map((f) => (
                    <option key={f.faculty_id} value={f.faculty_id}>
                      {f.name} ({f.faculty_id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block font-medium text-gray-700">
                  2. Class
                </label>

                <select
                  name="class_name"
                  value={form.class_name}
                  onChange={handleInputChange}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-500 text-gray-700"
                >
                  <option value="">Select Class</option>

                  {classOptions.map((cls) => (
                    <option key={cls} value={cls}>
                      {cls}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block font-medium text-gray-700">
                  3. Task Type
                </label>

                <select
                  name="task_type"
                  value={form.task_type}
                  onChange={handleInputChange}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-500 text-gray-700"
                >
                  {taskTypeOptions.map((type) => (
                    <option key={type} value={type}>
                      {type} Task
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block font-medium text-gray-700">
                  4. Test Code
                </label>

                <select
                  name="subject_name"
                  value={form.subject_name}
                  onChange={handleInputChange}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-500 text-gray-700"
                >
                  <option value="">Select Test Code</option>

                  {testCodes.map((test) => (
                    <option key={test.test_code} value={test.test_code}>
                      {test.test_code}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block font-medium text-gray-700">
                  5. Total Test Note
                </label>

                <input
                  type="text"
                  name="total_test_note"
                  value={form.total_test_note}
                  onChange={handleInputChange}
                  placeholder="Enter total test note"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-500 text-gray-700"
                />
              </div>

              {form.task_type === 'Weekly' && (
                <div>
                  <label className="mb-2 block font-medium text-gray-700">
                    Due Date
                  </label>

                  <input
                    type="date"
                    name="due_date"
                    value={form.due_date}
                    onChange={(e) => {
                      const today = new Date().toISOString().split('T')[0];

                      if (e.target.value < today) {
                        alert('Past due dates are not allowed');
                        return;
                      }

                      handleInputChange(e);
                    }}
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-500 text-gray-700"
                  />
                </div>
              )}

              <div>
                <label className="mb-2 block font-medium text-gray-700">
                  Priority
                </label>

                <select
                  name="priority"
                  value={form.priority}
                  onChange={handleInputChange}
                  disabled={form.task_type === 'Daily'}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-500 text-gray-700 disabled:bg-gray-100"
                >
                  {priorityOptions.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block font-medium text-gray-700">
                  Other Tasks
                </label>

                <textarea
                  name="other_tasks"
                  value={form.other_tasks}
                  onChange={handleInputChange}
                  placeholder="Enter other tasks"
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-500 text-gray-700"
                />
              </div>

              <button
                type="submit"
                disabled={taskLoading}
                className="rounded-lg bg-blue-700 px-6 py-3 text-white transition hover:bg-blue-800 disabled:bg-gray-400"
              >
                {taskLoading ? 'Assigning...' : 'Assign Task'}
              </button>
            </form>
          </div>
        )}

        {canAccessAllTasks && activeSection === 'allTasks' && (
          <div className="mb-8 rounded-2xl bg-white p-6 shadow-md md:p-8">
            <h3 className="mb-4 text-xl md:text-2xl font-bold text-blue-700">
              All Faculty Assigned Tasks
            </h3>

            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-blue-200 bg-blue-100 p-4 shadow-sm">
                <p className="text-sm font-medium text-blue-700">All Pending</p>
                <p className="mt-2 text-3xl font-bold text-blue-900">
                  {allStats.pending}
                </p>
              </div>

              <div className="rounded-xl border border-green-200 bg-green-100 p-4 shadow-sm">
                <p className="text-sm font-medium text-green-700">
                  All Completed
                </p>
                <p className="mt-2 text-3xl font-bold text-green-900">
                  {allStats.completed}
                </p>
              </div>

              <div className="rounded-xl border border-red-200 bg-red-100 p-4 shadow-sm">
                <p className="text-sm font-medium text-red-700">All Overdue</p>
                <p className="mt-2 text-3xl font-bold text-red-900">
                  {allStats.overdue}
                </p>
              </div>

              <div className="rounded-xl border border-yellow-200 bg-yellow-100 p-4 shadow-sm">
                <p className="text-sm font-medium text-yellow-700">
                  All Due Today
                </p>
                <p className="mt-2 text-3xl font-bold text-yellow-900">
                  {allStats.dueToday}
                </p>
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-2 block font-medium text-gray-700">
                Filter All Faculty Tasks
              </label>

              <select
                value={allTaskFilter}
                onChange={(e) => setAllTaskFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-500 md:w-72 text-gray-700"
              >
                <option value="All">All</option>
                <option value="Pending">Pending</option>
                <option value="Completed">Completed</option>
                <option value="Overdue">Overdue</option>
                <option value="Due Today">Due Today</option>
              </select>
            </div>

            {allTaskLoading ? (
              <p className="text-gray-600">Loading all assigned tasks...</p>
            ) : filteredAllTasks.length === 0 ? (
              <p className="text-gray-600">
                No assigned tasks found for this filter.
              </p>
            ) : (
              <div className="space-y-4">
                {filteredAllTasks.map((task) => (
                  <div key={task.id} className={getTaskCardClass(task)}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">{renderTaskDetails(task, true)}</div>

                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => handleReassignTask(task)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          Reassign
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteTask(task.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {canAccessAllTasks && activeSection === 'dailyTasks' && (
          <div className="mb-8 rounded-2xl bg-white p-6 shadow-md md:p-8">
            <h3 className="mb-4 text-xl md:text-2xl font-bold text-blue-700">
              All Faculty Daily Task
            </h3>

            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-blue-200 bg-blue-100 p-4 shadow-sm">
                <p className="text-sm font-medium text-blue-700">
                  Daily Pending
                </p>

                <p className="mt-2 text-3xl font-bold text-blue-900">
                  {dailyStats.pending}
                </p>
              </div>

              <div className="rounded-xl border border-green-200 bg-green-100 p-4 shadow-sm">
                <p className="text-sm font-medium text-green-700">
                  Daily Completed
                </p>

                <p className="mt-2 text-3xl font-bold text-green-900">
                  {dailyStats.completed}
                </p>
              </div>

              <div className="rounded-xl border border-red-200 bg-red-100 p-4 shadow-sm">
                <p className="text-sm font-medium text-red-700">
                  Daily Overdue
                </p>

                <p className="mt-2 text-3xl font-bold text-red-900">
                  {dailyStats.overdue}
                </p>
              </div>

              <div className="rounded-xl border border-yellow-200 bg-yellow-100 p-4 shadow-sm">
                <p className="text-sm font-medium text-yellow-700">
                  Daily Due Today
                </p>

                <p className="mt-2 text-3xl font-bold text-yellow-900">
                  {dailyStats.dueToday}
                </p>
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-2 block font-medium text-gray-700">
                Filter Daily Tasks
              </label>

              <select
                value={dailyTaskFilter}
                onChange={(e) => setDailyTaskFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-500 md:w-72 text-gray-700"
              >
                <option value="All">All</option>
                <option value="Pending">Pending</option>
                <option value="Completed">Completed</option>
                <option value="Overdue">Overdue</option>
                <option value="Due Today">Due Today</option>
              </select>
            </div>

            {dailyTaskLoading ? (
              <p className="text-gray-600">Loading daily tasks...</p>
            ) : filteredDailyTasks.length === 0 ? (
              <p className="text-gray-600">
                No daily tasks found for this filter.
              </p>
            ) : (
              <div className="space-y-4">
                {filteredDailyTasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">{renderTaskDetails(task, true)}</div>

                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => handleReassignTask(task)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          Reassign
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteTask(task.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeSection === 'myChecklist' && (
          <div className="mb-8 rounded-2xl bg-white p-6 shadow-md md:p-8">
            <h3 className="mb-4 text-xl md:text-2xl font-bold text-blue-700">
              My Task Checklist
            </h3>

            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-blue-200 bg-blue-100 p-4 shadow-sm">
                <p className="text-sm font-medium text-blue-700">
                  My Pending Tasks
                </p>

                <p className="mt-2 text-3xl font-bold text-blue-900">
                  {myStats.pending}
                </p>
              </div>

              <div className="rounded-xl border border-green-200 bg-green-100 p-4 shadow-sm">
                <p className="text-sm font-medium text-green-700">
                  My Completed Tasks
                </p>

                <p className="mt-2 text-3xl font-bold text-green-900">
                  {myStats.completed}
                </p>
              </div>

              <div className="rounded-xl border border-red-200 bg-red-100 p-4 shadow-sm">
                <p className="text-sm font-medium text-red-700">
                  My Overdue Tasks
                </p>

                <p className="mt-2 text-3xl font-bold text-red-900">
                  {myStats.overdue}
                </p>
              </div>

              <div className="rounded-xl border border-yellow-200 bg-yellow-100 p-4 shadow-sm">
                <p className="text-sm font-medium text-yellow-700">
                  My Due Today
                </p>

                <p className="mt-2 text-3xl font-bold text-yellow-900">
                  {myStats.dueToday}
                </p>
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-2 block font-medium text-gray-700">
                Filter My Tasks
              </label>

              <select
                value={myTaskFilter}
                onChange={(e) => setMyTaskFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-500 md:w-72 text-gray-700"
              >
                <option value="All">All</option>
                <option value="Pending">Pending</option>
                <option value="Completed">Completed</option>
                <option value="Overdue">Overdue</option>
                <option value="Due Today">Due Today</option>
              </select>
            </div>

            {taskLoading ? (
              <p className="text-gray-600">Loading tasks...</p>
            ) : filteredMyTasks.length === 0 ? (
              <p className="text-gray-600">
                No tasks assigned for this filter.
              </p>
            ) : (
              <div className="space-y-4">
                {filteredMyTasks.map((task) => (
                  <div key={task.id} className={getTaskCardClass(task)}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex flex-1 items-start gap-3">
                        <input
                          type="checkbox"
                          checked={task.is_completed}
                          onChange={() =>
                            handleToggleTask(task.id, task.is_completed)
                          }
                          className="mt-1 h-4 w-4"
                        />

                        {renderTaskDetails(task, true)}
                      </div>

                      {canAccessAllTasks && (
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => handleReassignTask(task)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            Reassign
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteTask(task.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {manageModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
          onClick={() => setManageModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="manage-modal-title"
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h3 id="manage-modal-title" className="text-xl font-bold text-blue-900">
                Manage
              </h3>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setManageModalOpen(false)}
                className="rounded-full px-3 py-1 text-xl text-gray-500 hover:bg-gray-100"
              >
                ×
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <Link
                href={`/faculty-dashboard/manage/students?id=${encodeURIComponent(facultyId)}&batch=${selectedBatch === 'Test Batch' ? 'test' : 'regular'}`}
                onClick={() => setManageModalOpen(false)}
                className="rounded-xl border border-gray-200 px-4 py-4 text-center font-semibold text-blue-900 transition hover:border-blue-300 hover:bg-blue-50"
              >
                Students
              </Link>
              <Link
                href={`/faculty-dashboard/manage/faculty?id=${encodeURIComponent(facultyId)}&batch=${selectedBatch === 'Test Batch' ? 'test' : 'regular'}`}
                onClick={() => setManageModalOpen(false)}
                className="rounded-xl border border-gray-200 px-4 py-4 text-center font-semibold text-blue-900 transition hover:border-blue-300 hover:bg-blue-50"
              >
                Faculty
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FacultyProfile() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <FacultyProfileInner />
    </Suspense>
  );
}