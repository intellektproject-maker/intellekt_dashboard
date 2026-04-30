'use client';
import { useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
const API_BASE = 'https://responsible-wonder-production.up.railway.app';

function FacultyProfileInner() {
const searchParams = useSearchParams();
const facultyId = searchParams.get('id');
const loginFacultyId = searchParams.get('loginId') || facultyId;
const [faculty, setFaculty] = useState(null);
const [facultyList, setFacultyList] = useState([]);
const [tasks, setTasks] = useState([]);
const [allTasks, setAllTasks] = useState([]);
const [error, setError] = useState('');
const [taskLoading, setTaskLoading] = useState(false);
const [allTaskLoading, setAllTaskLoading] = useState(false);
const [myTaskFilter, setMyTaskFilter] = useState('All');
const [allTaskFilter, setAllTaskFilter] = useState('All');
const canAccessAllTasks =
loginFacultyId === 'IG001' || loginFacultyId === 'IG002';
const [activeSection, setActiveSection] = useState('');
const classOptions = [
'SB12',
'SB11',
'SB10',
'CBSE12',
'CBSE11',
'CBSE10',
'ISC12',
'ISC11'
    ];
const subjectOptions = ['Physics', 'Maths'];
const priorityOptions = ['High', 'Medium', 'Low'];
const [form, setForm] = useState({
faculty_id: '',
faculty_name: '',
class_name: '',
subject_name: '',
total_test_note: '',
other_tasks: '',
due_date: '',
priority: 'Medium'
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
throw new Error(data?.details || data?.error || 'Request failed');
        }
return data;
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
function getPriorityBadge(priority) {
if (priority === 'High') {
return 'bg-red-100 text-red-700 border border-red-200';
        }
if (priority === 'Medium') {
return 'bg-yellow-100 text-yellow-700 border border-yellow-200';
        }
return 'bg-green-100 text-green-700 border border-green-200';
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
faculty_name: data.name || ''
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
async function fetchAllFaculty() {
try {
const data = await safeFetchJson(`${API_BASE}/faculty`);
setFacultyList(Array.isArray(data) ? data : []);
            } catch (err) {
                console.error(err);
            }
        }
fetchAllFaculty();
    }, []);
useEffect(() => {
async function fetchMyTasks() {
try {
setTaskLoading(true);
const data = await safeFetchJson(`${API_BASE}/faculty-tasks/${facultyId}`);
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
async function refreshMyTasks() {
try {
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
function handleFacultyChange(e) {
const selectedId = e.target.value;
const selectedFaculty = facultyList.find((f) => f.faculty_id === selectedId);
setForm((prev) => ({
...prev,
faculty_id: selectedId,
faculty_name: selectedFaculty ? selectedFaculty.name : ''
        }));
    }
function handleInputChange(e) {
const { name, value } = e.target;
setForm((prev) => ({
...prev,
[name]: value
        }));
    }
async function handleAssignTask(e) {
        e.preventDefault();
if (
!form.faculty_id ||
!form.faculty_name ||
!form.class_name ||
!form.subject_name
        ) {
alert('Please fill all required fields');
return;
        }
try {
const data = await safeFetchJson(`${API_BASE}/faculty-tasks`, {
method: 'POST',
headers: {
'Content-Type': 'application/json'
                },
body: JSON.stringify({
                    loginFacultyId,
faculty_id: form.faculty_id,
faculty_name: form.faculty_name,
class_name: form.class_name,
subject_name: form.subject_name,
total_test_note: form.total_test_note,
other_tasks: form.other_tasks,
due_date: form.due_date,
priority: form.priority
                })
            });
alert(data.message || 'Task assigned successfully');
setForm((prev) => ({
...prev,
class_name: '',
subject_name: '',
total_test_note: '',
other_tasks: '',
due_date: '',
priority: 'Medium'
            }));
await refreshMyTasks();
await refreshAllFacultyTasks();
        } catch (err) {
            console.error(err);
alert(err.message || 'Failed to assign task');
        }
    }
async function handleToggleTask(taskId, currentStatus) {
try {
await safeFetchJson(`${API_BASE}/faculty-tasks/${taskId}`, {
method: 'PUT',
headers: {
'Content-Type': 'application/json'
                },
body: JSON.stringify({
is_completed: !currentStatus
                })
            });
await refreshMyTasks();
await refreshAllFacultyTasks();
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
method: 'DELETE'
                }
            );
alert('Task deleted successfully');
await refreshMyTasks();
await refreshAllFacultyTasks();
        } catch (err) {
            console.error(err);
alert(err.message || 'Failed to delete task');
        }
    }
const myStats = useMemo(() => {
const pending = tasks.filter((task) => !task.is_completed).length;
const completed = tasks.filter((task) => task.is_completed).length;
const overdue = tasks.filter((task) => isOverdue(task)).length;
const dueToday = tasks.filter((task) => isDueToday(task)).length;
return { pending, completed, overdue, dueToday };
    }, [tasks]);
const allStats = useMemo(() => {
const pending = allTasks.filter((task) => !task.is_completed).length;
const completed = allTasks.filter((task) => task.is_completed).length;
const overdue = allTasks.filter((task) => isOverdue(task)).length;
const dueToday = allTasks.filter((task) => isDueToday(task)).length;
return { pending, completed, overdue, dueToday };
    }, [allTasks]);
const filteredMyTasks = useMemo(() => {
return applyTaskFilter(tasks, myTaskFilter);
    }, [tasks, myTaskFilter]);
const filteredAllTasks = useMemo(() => {
return applyTaskFilter(allTasks, allTaskFilter);
    }, [allTasks, allTaskFilter]);
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
                    Faculty Profile
</h2>
<div className="mb-8 space-y-4 rounded-2xl bg-white p-6 shadow-md md:p-8">
<p className="text-gray-700 text-base md:text-lg"><b>Faculty ID:</b> {faculty.faculty_id}</p>
<p className="text-gray-700 text-base md:text-lg"><b>Name:</b> {faculty.name}</p>
<p className="text-gray-700 text-base md:text-lg"><b>Email:</b> {faculty.email}</p>
<p className="text-gray-700 text-base md:text-lg"><b>Phone:</b> {faculty.phone}</p>
</div>
<div className="mb-8">
<h3 className="mb-6 text-2xl md:text-3xl font-bold text-blue-700">
                        Task Management
</h3>
<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
{canAccessAllTasks && (
<button
type="button"
onClick={() =>
setActiveSection(activeSection === 'allTasks' ? '' : 'allTasks')
}
className={`rounded-2xl border p-7 text-left shadow-md transition ${
activeSection === 'allTasks'
                                        ? 'border-blue-600 bg-blue-50'
                                        : 'border-gray-200 bg-white hover:bg-gray-50'
}`}
>
<h4 className="mb-3 text-xl font-bold text-blue-700">
                                    All Faculty Assigned Tasks
</h4>
<p className="text-gray-600 text-base">
                                    View, filter and delete tasks assigned to all faculty members.
</p>
</button>
                        )}
<button
type="button"
onClick={() =>
setActiveSection(activeSection === 'myTasks' ? '' : 'myTasks')
}
className={`rounded-2xl border p-7 text-left shadow-md transition ${
activeSection === 'myTasks'
                                    ? 'border-blue-600 bg-blue-50'
                                    : 'border-gray-200 bg-white hover:bg-gray-50'
}`}
>
<h4 className="mb-3 text-xl font-bold text-blue-700">
                                My Task Checklist & Task Assignment
</h4>
<p className="text-gray-600 text-base">
                                View, filter and update the tasks assigned to this faculty.
</p>
</button>
</div>
</div>
{canAccessAllTasks && activeSection === 'allTasks' && (
<div className="mb-8 rounded-2xl bg-white p-6 shadow-md md:p-8">
<h3 className="mb-4 text-xl md:text-2xl font-bold text-blue-700">
                            All Faculty Assigned Tasks
</h3>
<div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
<div className="rounded-xl border border-blue-200 bg-blue-100 p-4 shadow-sm">
<p className="text-sm font-medium text-blue-700">All Pending</p>
<p className="mt-2 text-3xl font-bold text-blue-900">{allStats.pending}</p>
</div>
<div className="rounded-xl border border-green-200 bg-green-100 p-4 shadow-sm">
<p className="text-sm font-medium text-green-700">All Completed</p>
<p className="mt-2 text-3xl font-bold text-green-900">{allStats.completed}</p>
</div>
<div className="rounded-xl border border-red-200 bg-red-100 p-4 shadow-sm">
<p className="text-sm font-medium text-red-700">All Overdue</p>
<p className="mt-2 text-3xl font-bold text-red-900">{allStats.overdue}</p>
</div>
<div className="rounded-xl border border-yellow-200 bg-yellow-100 p-4 shadow-sm">
<p className="text-sm font-medium text-yellow-700">All Due Today</p>
<p className="mt-2 text-3xl font-bold text-yellow-900">{allStats.dueToday}</p>
</div>
</div>
{allStats.overdue > 0 && (
<div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-medium text-red-700">
                                ⚠ Overdue tasks are pending for some faculty members.
</div>
                        )}
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
<p className="text-gray-600">No assigned tasks found for this filter.</p>
                        ) : (
<div className="space-y-4">
{filteredAllTasks.map((task) => (
<div
key={task.id}
className={`rounded-xl border p-4 shadow-sm ${
isOverdue(task)
                                                ? 'border-red-200 bg-red-50'
                                                : isDueToday(task)
                                                ? 'border-yellow-200 bg-yellow-50'
                                                : 'bg-gray-50'
}`}
>
<div className="flex items-start justify-between gap-4">
<div className="flex-1 space-y-1 text-gray-700">
<div className="flex flex-wrap items-center gap-2">
<p className="font-medium text-gray-800">
{task.faculty_name} ({task.faculty_id})
</p>
<span
className={`rounded-full px-2 py-1 text-xs font-medium ${getPriorityBadge(
task.priority || 'Medium'
                                                        )}`}
>
{task.priority || 'Medium'}
</span>
{isOverdue(task) && (
<span className="rounded-full bg-red-600 px-2 py-1 text-xs font-medium text-white">
                                                            Overdue
</span>
                                                    )}
{isDueToday(task) && (
<span className="rounded-full bg-yellow-500 px-2 py-1 text-xs font-medium text-white">
                                                            Due Today
</span>
                                                    )}
{task.is_completed && (
<span className="rounded-full bg-green-600 px-2 py-1 text-xs font-medium text-white">
                                                            Completed
</span>
                                                    )}
</div>
<p><b>Class:</b> {task.class_name}</p>
<p><b>Subject:</b> {task.subject_name}</p>
<p><b>Total Test Note:</b> {task.total_test_note || '-'}</p>
<p>
<b>Due Date:</b>{' '}
{task.due_date
? new Date(task.due_date).toLocaleDateString()
: '-'}
</p>
{task.completed_at && (
<p>
<b>Completed On:</b>{' '}
{new Date(task.completed_at).toLocaleDateString()}
</p>
                                                )}
<p><b>Other Tasks:</b> {task.other_tasks || '-'}</p>
<p className="text-sm text-gray-500">
                                                    Assigned by: {task.assigned_by}
</p>
</div>
<button
type="button"
onClick={() => handleDeleteTask(task.id)}
className="rounded-lg bg-red-600 px-4 py-2 text-white transition hover:bg-red-700"
>
                                                Delete
</button>
</div>
</div>
                                ))}
</div>
                        )}
</div>
                )}
{activeSection === 'myTasks' && (
<div className="mb-8 rounded-2xl bg-white p-6 shadow-md md:p-8">
<h3 className="mb-4 text-xl md:text-2xl font-bold text-blue-700">
                            My Task Checklist & Task Assignment
</h3>
<div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
<div className="rounded-xl border border-blue-200 bg-blue-100 p-4 shadow-sm">
<p className="text-sm font-medium text-blue-700">My Pending Tasks</p>
<p className="mt-2 text-3xl font-bold text-blue-900">{myStats.pending}</p>
</div>
<div className="rounded-xl border border-green-200 bg-green-100 p-4 shadow-sm">
<p className="text-sm font-medium text-green-700">My Completed Tasks</p>
<p className="mt-2 text-3xl font-bold text-green-900">{myStats.completed}</p>
</div>
<div className="rounded-xl border border-red-200 bg-red-100 p-4 shadow-sm">
<p className="text-sm font-medium text-red-700">My Overdue Tasks</p>
<p className="mt-2 text-3xl font-bold text-red-900">{myStats.overdue}</p>
</div>
<div className="rounded-xl border border-yellow-200 bg-yellow-100 p-4 shadow-sm">
<p className="text-sm font-medium text-yellow-700">My Due Today</p>
<p className="mt-2 text-3xl font-bold text-yellow-900">{myStats.dueToday}</p>
</div>
</div>
{canAccessAllTasks && (
<form onSubmit={handleAssignTask} className="mb-6 space-y-4">
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
<option key={cls} value={cls}>{cls}</option>
                                        ))}
</select>
</div>
<div>
<label className="mb-2 block font-medium text-gray-700">
                                        3. Subject
</label>
<select
name="subject_name"
value={form.subject_name}
onChange={handleInputChange}
className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-500 text-gray-700"
>
<option value="">Select Subject</option>
{subjectOptions.map((subject) => (
<option key={subject} value={subject}>{subject}</option>
                                        ))}
</select>
</div>
<div>
<label className="mb-2 block font-medium text-gray-700">
                                        4. Total Test Note
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
<div>
<label className="mb-2 block font-medium text-gray-700">
                                        Due Date
</label>
<input
type="date"
name="due_date"
value={form.due_date}
onChange={handleInputChange}
className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-500 text-gray-700"
/>
</div>
<div>
<label className="mb-2 block font-medium text-gray-700">
                                        Priority
</label>
<select
name="priority"
value={form.priority}
onChange={handleInputChange}
className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-500 text-gray-700"
>
{priorityOptions.map((priority) => (
<option key={priority} value={priority}>{priority}</option>
                                        ))}
</select>
</div>
<div>
<label className="mb-2 block font-medium text-gray-700">
                                        5. Other Tasks
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
className="rounded-lg bg-blue-700 px-6 py-3 text-white transition hover:bg-blue-800"
>
                                    Assign Task
</button>
</form>
                        )}
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
<p className="text-gray-600">No tasks assigned for this filter.</p>
                        ) : (
<div className="space-y-4">
{filteredMyTasks.map((task) => (
<div
key={task.id}
className={`rounded-xl border p-4 shadow-sm ${
isOverdue(task)
                                                ? 'border-red-200 bg-red-50'
                                                : isDueToday(task)
                                                ? 'border-yellow-200 bg-yellow-50'
                                                : 'bg-gray-50'
}`}
>
<div className="flex items-start justify-between gap-4">
<div className="flex flex-1 items-start gap-3">
<input
type="checkbox"
checked={task.is_completed}
onChange={() => handleToggleTask(task.id, task.is_completed)}
className="mt-1 h-4 w-4"
/>
<div className="space-y-1 text-gray-700">
<div className="flex flex-wrap items-center gap-2">
<p
className={`font-medium ${
task.is_completed
                                                                    ? 'text-gray-500 line-through'
                                                                    : 'text-gray-800'
}`}
>
{task.faculty_name} ({task.faculty_id})
</p>
<span
className={`rounded-full px-2 py-1 text-xs font-medium ${getPriorityBadge(
task.priority || 'Medium'
                                                            )}`}
>
{task.priority || 'Medium'}
</span>
{isOverdue(task) && (
<span className="rounded-full bg-red-600 px-2 py-1 text-xs font-medium text-white">
                                                                Overdue
</span>
                                                        )}
{isDueToday(task) && (
<span className="rounded-full bg-yellow-500 px-2 py-1 text-xs font-medium text-white">
                                                                Due Today
</span>
                                                        )}
</div>
<p><b>Class:</b> {task.class_name}</p>
<p><b>Subject:</b> {task.subject_name}</p>
<p><b>Total Test Note:</b> {task.total_test_note || '-'}</p>
<p>
<b>Due Date:</b>{' '}
{task.due_date
? new Date(task.due_date).toLocaleDateString()
: '-'}
</p>
{task.completed_at && (
<p>
<b>Completed On:</b>{' '}
{new Date(task.completed_at).toLocaleDateString()}
</p>
                                                    )}
<p><b>Other Tasks:</b> {task.other_tasks || '-'}</p>
<p className="text-sm text-gray-500">
                                                        Assigned by: {task.assigned_by}
</p>
</div>
</div>
{canAccessAllTasks && (
<button
type="button"
onClick={() => handleDeleteTask(task.id)}
className="font-medium text-red-600 hover:text-red-800"
>
                                                    Delete
</button>
                                            )}
</div>
</div>
                                ))}
</div>
                        )}
</div>
                )}
</div>
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