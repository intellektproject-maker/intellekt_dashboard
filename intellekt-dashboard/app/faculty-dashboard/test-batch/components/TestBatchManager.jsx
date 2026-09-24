"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://responsible-wonder-production.up.railway.app";

const ADMIN_IDS = ["IG001", "IG002"];

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("en-IN");
}
function percent(value) { return Number(value || 0).toFixed(2); }
function money(value) { return Number(value || 0).toLocaleString("en-IN"); }

async function api(path, options = {}) {
  const response = await fetch(API_BASE + path, {
    cache: "no-store",
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function Card({ children, className = "" }) {
  return <div className={"bg-white rounded-2xl shadow-md border border-gray-200 p-5 md:p-6 " + className}>{children}</div>;
}
function Header({ title, description }) {
  return <div className="mb-5"><h2 className="text-xl md:text-2xl font-bold text-blue-800">{title}</h2>{description && <p className="text-sm text-gray-500 mt-1">{description}</p>}</div>;
}
function ErrorText({ error }) { return error ? <p className="text-red-600 text-sm mt-3">{error}</p> : null; }
function Loading({ text = "Loading..." }) { return <p className="text-gray-500 py-4">{text}</p>; }
function AdminGate({ adminId, children }) {
  if (!ADMIN_IDS.includes(String(adminId).toUpperCase())) {
    return <Card><h2 className="text-xl font-bold text-red-700">Unauthorized</h2><p className="text-gray-600 mt-2">Test Batch management is available only to authorized administrators.</p></Card>;
  }
  return children;
}
function useAdminId() {
  const params = useSearchParams();
  return (params.get("id") || "").toUpperCase().trim();
}
function SeriesSelect({ series, value, onChange, allLabel = "All Test Series" }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} className="border rounded-lg px-3 py-2 bg-white">
    {allLabel && <option value="">{allLabel}</option>}
    {series.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
  </select>;
}

function StudentsSection({ adminId }) {
  const [series, setSeries] = useState([]);
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [seriesFilter, setSeriesFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name:"", class:"", board:"", mode_of_education:"", phone:"", email:"", school_name:"", password:"", test_series_id:"" });

  async function loadSeries() {
    const d = await api("/test-batch/series?adminId=" + encodeURIComponent(adminId));
    setSeries(d.series || []);
    setForm((f) => ({ ...f, test_series_id: f.test_series_id || (d.series?.[0] ? String(d.series[0].id) : "") }));
  }
  async function loadStudents() {
    setLoading(true);
    try {
      const p = new URLSearchParams({ adminId });
      if (search.trim()) p.set("search", search.trim());
      if (seriesFilter) p.set("seriesId", seriesFilter);
      const d = await api("/test-batch/students?" + p.toString());
      setStudents(d.students || []);
      setError("");
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { loadSeries().catch((e) => setError(e.message)); }, [adminId]);
  useEffect(() => { const t = setTimeout(loadStudents, 150); return () => clearTimeout(t); }, [adminId, search, seriesFilter]);

  function resetForm() {
    setEditing(null);
    setForm({ name:"", class:"", board:"", mode_of_education:"", phone:"", email:"", school_name:"", password:"", test_series_id: series[0] ? String(series[0].id) : "" });
  }
  function editStudent(s) {
    setEditing(s.roll_no);
    setForm({ name:s.name || "", class:s.class || "", board:s.board || "", mode_of_education:s.mode_of_education || "", phone:s.phone || "", email:s.email || "", school_name:s.school_name || "", password:"", test_series_id:String(s.test_series_id || "") });
    window.scrollTo({ top:0, behavior:"smooth" });
  }
  async function submit(e) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      if (!form.test_series_id) throw new Error("Select a test series");
      const payload = { ...form, adminId, test_series_id:Number(form.test_series_id) };
      if (!payload.password) delete payload.password;
      if (editing) await api("/test-batch/students/" + encodeURIComponent(editing), { method:"PUT", body:JSON.stringify(payload) });
      else await api("/test-batch/students", { method:"POST", body:JSON.stringify(payload) });
      resetForm(); await loadStudents();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }
  async function removeStudent(rollNo) {
    if (!window.confirm("Delete Test Batch student " + rollNo + "?")) return;
    try { await api("/test-batch/students/" + encodeURIComponent(rollNo), { method:"DELETE", headers:{"x-admin-id":adminId} }); await loadStudents(); }
    catch (e) { setError(e.message); }
  }

  return <div className="mt-8 space-y-5">
    <div className="border-t-4 border-blue-700 pt-6"><Header title="Test Batch Students" description="Separate student category. Regular Student records are not used by this section." /></div>
    <Card>
      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <input className="border rounded-lg px-4 py-3" placeholder="Student Name *" value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} required />
        <input className="border rounded-lg px-4 py-3" placeholder="Class" value={form.class} onChange={(e)=>setForm({...form,class:e.target.value})} />
        <input className="border rounded-lg px-4 py-3" placeholder="Board" value={form.board} onChange={(e)=>setForm({...form,board:e.target.value})} />
        <input className="border rounded-lg px-4 py-3" placeholder="Mode of Education" value={form.mode_of_education} onChange={(e)=>setForm({...form,mode_of_education:e.target.value})} />
        <input className="border rounded-lg px-4 py-3" placeholder="Phone" value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})} />
        <input className="border rounded-lg px-4 py-3" type="email" placeholder="Email" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})} />
        <input className="border rounded-lg px-4 py-3" placeholder="School Name" value={form.school_name} onChange={(e)=>setForm({...form,school_name:e.target.value})} />
        <input className="border rounded-lg px-4 py-3" type="password" placeholder={editing ? "New Password (optional)" : "Password (optional)"} value={form.password} onChange={(e)=>setForm({...form,password:e.target.value})} />
        <select className="border rounded-lg px-4 py-3 bg-white" value={form.test_series_id} onChange={(e)=>setForm({...form,test_series_id:e.target.value})} required>
          <option value="">Select Test Series *</option>{series.map((s)=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div className="md:col-span-2 lg:col-span-3 flex flex-wrap gap-3">
          <button disabled={saving} className="bg-blue-700 hover:bg-blue-800 text-white px-6 py-3 rounded-lg font-semibold disabled:opacity-50">{saving ? "Saving..." : editing ? "Update Test Batch Student" : "Add Test Batch Student"}</button>
          <button type="button" onClick={resetForm} className="bg-gray-200 hover:bg-gray-300 px-6 py-3 rounded-lg font-semibold">Reset</button>
        </div>
      </form>
      <ErrorText error={error} />
    </Card>
    <Card>
      <div className="flex flex-wrap gap-3 mb-5">
        <input className="border rounded-lg px-4 py-2 flex-1 min-w-[220px]" placeholder="Search name or roll number" value={search} onChange={(e)=>setSearch(e.target.value)} />
        <SeriesSelect series={series} value={seriesFilter} onChange={setSeriesFilter} />
        <button onClick={loadStudents} className="bg-blue-700 text-white px-5 py-2 rounded-lg hover:bg-blue-800">Refresh</button>
      </div>
      {loading ? <Loading /> : students.length === 0 ? <p className="text-gray-500">No Test Batch students found.</p> :
        <div className="overflow-x-auto"><table className="w-full min-w-[1100px] border-collapse">
          <thead><tr className="bg-blue-700 text-white"><th className="text-left p-3">Roll No</th><th className="text-left p-3">Name</th><th className="text-left p-3">Class</th><th className="text-left p-3">Board</th><th className="text-left p-3">Test Series</th><th className="text-left p-3">Phone</th><th className="text-left p-3">Added</th><th className="text-left p-3">Actions</th></tr></thead>
          <tbody>{students.map((s,i)=><tr key={s.roll_no} className={i%2===0?"bg-gray-50 border-b":"bg-white border-b"}>
            <td className="p-3 font-semibold">{s.roll_no}</td><td className="p-3">{s.name}</td><td className="p-3">{s.class || "-"}</td><td className="p-3">{s.board || "-"}</td><td className="p-3">{s.test_series_name}</td><td className="p-3">{s.phone || "-"}</td><td className="p-3">{formatDate(s.created_at)}</td>
            <td className="p-3"><div className="flex gap-2"><button onClick={()=>editStudent(s)} className="bg-yellow-500 text-white px-3 py-1 rounded">Edit</button><button onClick={()=>removeStudent(s.roll_no)} className="bg-red-600 text-white px-3 py-1 rounded">Delete</button></div></td>
          </tr>)}</tbody>
        </table></div>}
    </Card>
  </div>;
}

function MarksSection({ adminId }) {
  const [series,setSeries]=useState([]), [students,setStudents]=useState([]), [marks,setMarks]=useState([]);
  const [seriesFilter,setSeriesFilter]=useState(""), [search,setSearch]=useState(""), [testFilter,setTestFilter]=useState("");
  const [editingId,setEditingId]=useState(null), [loading,setLoading]=useState(true), [error,setError]=useState("");
  const [form,setForm]=useState({roll_no:"",test_code:"",subject_name:"",total_marks:"",marks_obtained:"",comments:""});
  async function loadSeries(){const d=await api("/test-batch/series?adminId="+encodeURIComponent(adminId));setSeries(d.series||[]);}
  async function loadStudents(){const d=await api("/test-batch/students?adminId="+encodeURIComponent(adminId));setStudents(d.students||[]);}
  async function loadMarks(){
    setLoading(true); try{const p=new URLSearchParams({adminId});if(seriesFilter)p.set("seriesId",seriesFilter);if(search.trim())p.set("search",search.trim());if(testFilter.trim())p.set("testCode",testFilter.trim());const d=await api("/test-batch/marks?"+p.toString());setMarks(d.marks||[]);setError("");}catch(e){setError(e.message)}finally{setLoading(false)}
  }
  useEffect(()=>{Promise.all([loadSeries(),loadStudents()]).catch(e=>setError(e.message))},[adminId]);
  useEffect(()=>{const t=setTimeout(loadMarks,120);return()=>clearTimeout(t)},[adminId,seriesFilter,search,testFilter]);
  function reset(){setEditingId(null);setForm({roll_no:"",test_code:"",subject_name:"",total_marks:"",marks_obtained:"",comments:""});}
  function edit(m){setEditingId(m.id);setForm({roll_no:m.roll_no,test_code:m.test_code,subject_name:m.subject_name||"",total_marks:m.total_marks,marks_obtained:m.marks_obtained,comments:m.comments||""});window.scrollTo({top:0,behavior:"smooth"});}
  async function submit(e){
    e.preventDefault();setError("");
    try{
      const p={...form,adminId,total_marks:Number(form.total_marks),marks_obtained:String(form.marks_obtained).trim()};
      if(!p.roll_no||!p.test_code||!p.subject_name||!p.total_marks||!p.marks_obtained)throw new Error("Student, test code, subject, total marks and obtained marks are required");
      if(editingId)await api("/test-batch/marks/"+editingId,{method:"PUT",body:JSON.stringify(p)});else await api("/test-batch/marks",{method:"POST",body:JSON.stringify(p)});
      reset();await loadMarks();
    }catch(e){setError(e.message)}
  }
  async function remove(id){if(!window.confirm("Delete this Test Batch mark?"))return;try{await api("/test-batch/marks/"+id,{method:"DELETE",headers:{"x-admin-id":adminId}});await loadMarks()}catch(e){setError(e.message)}}
  const summary=useMemo(()=>{const n=marks.filter(m=>m.marks_obtained!=="A");const total=n.reduce((s,m)=>s+Number(m.total_marks||0),0);const obtained=n.reduce((s,m)=>s+Number(m.marks_obtained||0),0);return{total,obtained,percentage:total?obtained/total*100:0}},[marks]);

  return <div className="mt-8 space-y-5">
    <div className="border-t-4 border-blue-700 pt-6"><Header title="Test Batch Marks Management" description="Marks are stored only in Test Batch tables and never in Regular Student marks." /></div>
    <Card><form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <select className="border rounded-lg px-4 py-3 bg-white" value={form.roll_no} onChange={e=>setForm({...form,roll_no:e.target.value})} required><option value="">Select Student</option>{students.map(s=><option key={s.roll_no} value={s.roll_no}>{s.roll_no} - {s.name} ({s.test_series_name})</option>)}</select>
      <input className="border rounded-lg px-4 py-3" placeholder="Test Code *" value={form.test_code} onChange={e=>setForm({...form,test_code:e.target.value})} required />
      <input className="border rounded-lg px-4 py-3" placeholder="Subject *" value={form.subject_name} onChange={e=>setForm({...form,subject_name:e.target.value})} required />
      <input className="border rounded-lg px-4 py-3" type="number" min="1" step="0.01" placeholder="Total Marks *" value={form.total_marks} onChange={e=>setForm({...form,total_marks:e.target.value})} required />
      <input className="border rounded-lg px-4 py-3" placeholder="Obtained Marks / A" value={form.marks_obtained} onChange={e=>setForm({...form,marks_obtained:e.target.value})} required />
      <input className="border rounded-lg px-4 py-3" placeholder="Comments" value={form.comments} onChange={e=>setForm({...form,comments:e.target.value})} />
      <div className="md:col-span-2 lg:col-span-3 flex gap-3"><button className="bg-blue-700 text-white px-6 py-3 rounded-lg hover:bg-blue-800">{editingId?"Update Mark":"Add Mark"}</button><button type="button" onClick={reset} className="bg-gray-200 px-6 py-3 rounded-lg">Reset</button></div>
    </form><ErrorText error={error}/></Card>
    <Card>
      <div className="flex flex-wrap gap-3 mb-5"><SeriesSelect series={series} value={seriesFilter} onChange={setSeriesFilter}/><input className="border rounded-lg px-4 py-2 flex-1 min-w-[220px]" placeholder="Search roll number or student" value={search} onChange={e=>setSearch(e.target.value)}/><input className="border rounded-lg px-4 py-2" placeholder="Test code" value={testFilter} onChange={e=>setTestFilter(e.target.value)}/><button onClick={loadMarks} className="bg-blue-700 text-white px-5 py-2 rounded-lg">Refresh</button></div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5"><div className="bg-blue-50 rounded-xl p-4"><p className="text-sm text-gray-500">Total Marks</p><p className="text-xl font-bold text-blue-800">{money(summary.total)}</p></div><div className="bg-green-50 rounded-xl p-4"><p className="text-sm text-gray-500">Obtained Marks</p><p className="text-xl font-bold text-green-700">{money(summary.obtained)}</p></div><div className="bg-gray-50 rounded-xl p-4"><p className="text-sm text-gray-500">Percentage</p><p className="text-xl font-bold">{percent(summary.percentage)}%</p></div></div>
      {loading?<Loading/>:marks.length===0?<p className="text-gray-500">No Test Batch marks found.</p>:<div className="overflow-x-auto"><table className="w-full min-w-[1200px] border-collapse"><thead><tr className="bg-blue-700 text-white"><th className="p-3 text-left">Roll No</th><th className="p-3 text-left">Name</th><th className="p-3 text-left">Series</th><th className="p-3 text-left">Test</th><th className="p-3 text-left">Subject</th><th className="p-3 text-left">Obtained</th><th className="p-3 text-left">Total</th><th className="p-3 text-left">Percentage</th><th className="p-3 text-left">Result</th><th className="p-3 text-left">Actions</th></tr></thead><tbody>{marks.map((m,i)=><tr key={m.id} className={i%2===0?"bg-gray-50 border-b":"bg-white border-b"}><td className="p-3 font-semibold">{m.roll_no}</td><td className="p-3">{m.name}</td><td className="p-3">{m.test_series_name}</td><td className="p-3">{m.test_code}</td><td className="p-3">{m.subject_name}</td><td className="p-3">{m.marks_obtained}</td><td className="p-3">{m.total_marks}</td><td className="p-3">{percent(m.percentage)}%</td><td className="p-3">{m.result_status}</td><td className="p-3"><div className="flex gap-2"><button onClick={()=>edit(m)} className="bg-yellow-500 text-white px-3 py-1 rounded">Edit</button><button onClick={()=>remove(m.id)} className="bg-red-600 text-white px-3 py-1 rounded">Delete</button></div></td></tr>)}</tbody></table></div>}
    </Card>
  </div>;
}

function AttendanceSection({ adminId }) {
  const [series,setSeries]=useState([]),[rows,setRows]=useState([]),[report,setReport]=useState([]);
  const today=new Date().toISOString().slice(0,10);
  const [seriesFilter,setSeriesFilter]=useState(""),[search,setSearch]=useState(""),[date,setDate]=useState(today),[from,setFrom]=useState(today),[to,setTo]=useState(today);
  const [mode,setMode]=useState("daily"),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState("");
  async function loadSeries(){const d=await api("/test-batch/series?adminId="+encodeURIComponent(adminId));setSeries(d.series||[]);}
  async function loadRows(){setLoading(true);try{const p=new URLSearchParams({adminId,date});if(seriesFilter)p.set("seriesId",seriesFilter);if(search.trim())p.set("search",search.trim());const d=await api("/test-batch/attendance?"+p.toString());setRows(d.attendance||[]);setError("")}catch(e){setError(e.message)}finally{setLoading(false)}}
  async function loadReport(){try{const p=new URLSearchParams({adminId,from,to});if(seriesFilter)p.set("seriesId",seriesFilter);if(search.trim())p.set("search",search.trim());const d=await api("/test-batch/attendance-report?"+p.toString());setReport(d.attendance||[])}catch(e){setError(e.message)}}
  useEffect(()=>{loadSeries().catch(e=>setError(e.message))},[adminId]);
  useEffect(()=>{const t=setTimeout(loadRows,100);return()=>clearTimeout(t)},[adminId,date,seriesFilter,search]);
  useEffect(()=>{const t=setTimeout(loadReport,150);return()=>clearTimeout(t)},[adminId,from,to,seriesFilter,search]);
  function period(next){const end=new Date(date+"T00:00:00"),start=new Date(end);if(next==="weekly")start.setDate(end.getDate()-6);if(next==="monthly")start.setDate(1);const iso=d=>d.toISOString().slice(0,10);setMode(next);setFrom(iso(start));setTo(iso(end));}
  function setStatus(roll,status){setRows(prev=>prev.map(r=>r.roll_no===roll?{...r,status}:r))}
  async function saveAll(){const records=rows.filter(r=>r.status==="Present"||r.status==="Absent").map(r=>({roll_no:r.roll_no,status:r.status}));if(!records.length){setError("Select Present or Absent for at least one student.");return}setSaving(true);try{await api("/test-batch/attendance",{method:"POST",body:JSON.stringify({adminId,attendanceDate:date,records})});await Promise.all([loadRows(),loadReport()])}catch(e){setError(e.message)}finally{setSaving(false)}}
  async function editStatus(id,status){if(!status)return;try{await api("/test-batch/attendance/"+id,{method:"PUT",body:JSON.stringify({adminId,status})});await Promise.all([loadRows(),loadReport()])}catch(e){setError(e.message)}}
  const stats=useMemo(()=>{const p=report.filter(r=>r.status==="Present").length,a=report.filter(r=>r.status==="Absent").length,t=p+a;return{p,a,t,percentage:t?p/t*100:0}},[report]);

  return <div className="mt-8 space-y-5">
    <div className="border-t-4 border-blue-700 pt-6"><Header title="Test Batch Attendance Management" description="Attendance is completely separate from Regular Student attendance." /></div>
    <Card><div className="flex flex-wrap gap-3 items-center"><label className="text-sm font-medium">Marking date</label><input type="date" className="border rounded-lg px-3 py-2" value={date} onChange={e=>setDate(e.target.value)}/><SeriesSelect series={series} value={seriesFilter} onChange={setSeriesFilter}/><input className="border rounded-lg px-3 py-2 flex-1 min-w-[220px]" placeholder="Search roll number or name" value={search} onChange={e=>setSearch(e.target.value)}/><button onClick={saveAll} disabled={saving||loading} className="bg-blue-700 text-white px-5 py-2 rounded-lg disabled:opacity-50">{saving?"Saving...":"Save Attendance"}</button></div><ErrorText error={error}/></Card>
    <Card>{loading?<Loading/>:rows.length===0?<p className="text-gray-500">No Test Batch students match the filters.</p>:<div className="overflow-x-auto"><table className="w-full min-w-[900px] border-collapse"><thead><tr className="bg-blue-700 text-white"><th className="p-3 text-left">Roll No</th><th className="p-3 text-left">Name</th><th className="p-3 text-left">Series</th><th className="p-3 text-left">Date</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Edit</th></tr></thead><tbody>{rows.map((r,i)=><tr key={r.roll_no} className={i%2===0?"bg-gray-50 border-b":"bg-white border-b"}><td className="p-3 font-semibold">{r.roll_no}</td><td className="p-3">{r.name}</td><td className="p-3">{r.test_series_name}</td><td className="p-3">{formatDate(r.attendance_date||date)}</td><td className="p-3"><select className="border rounded px-3 py-2" value={r.status||""} onChange={e=>setStatus(r.roll_no,e.target.value)}><option value="">Not Marked</option><option value="Present">Present</option><option value="Absent">Absent</option></select></td><td className="p-3">{r.id?<select className="border rounded px-3 py-1" value="" onChange={e=>editStatus(r.id,e.target.value)}><option value="">Edit Status</option><option value="Present">Present</option><option value="Absent">Absent</option></select>:"-"}</td></tr>)}</tbody></table></div>}</Card>
    <Card><Header title="Attendance Reports" description="Daily, weekly, monthly and custom date-range reports."/><div className="flex flex-wrap gap-2 mb-4"><button onClick={()=>{setMode("daily");setFrom(date);setTo(date)}} className={mode==="daily"?"bg-blue-700 text-white px-4 py-2 rounded-lg":"bg-gray-100 px-4 py-2 rounded-lg"}>Daily</button><button onClick={()=>period("weekly")} className={mode==="weekly"?"bg-blue-700 text-white px-4 py-2 rounded-lg":"bg-gray-100 px-4 py-2 rounded-lg"}>Weekly</button><button onClick={()=>period("monthly")} className={mode==="monthly"?"bg-blue-700 text-white px-4 py-2 rounded-lg":"bg-gray-100 px-4 py-2 rounded-lg"}>Monthly</button><input type="date" className="border rounded-lg px-3 py-2" value={from} onChange={e=>{setMode("custom");setFrom(e.target.value)}}/><input type="date" className="border rounded-lg px-3 py-2" value={to} onChange={e=>{setMode("custom");setTo(e.target.value)}}/></div><div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-5"><div className="bg-blue-50 rounded-xl p-4"><p className="text-sm text-gray-500">Records</p><p className="text-xl font-bold">{stats.t}</p></div><div className="bg-green-50 rounded-xl p-4"><p className="text-sm text-gray-500">Present</p><p className="text-xl font-bold text-green-700">{stats.p}</p></div><div className="bg-red-50 rounded-xl p-4"><p className="text-sm text-gray-500">Absent</p><p className="text-xl font-bold text-red-700">{stats.a}</p></div><div className="bg-gray-50 rounded-xl p-4"><p className="text-sm text-gray-500">Attendance %</p><p className="text-xl font-bold">{percent(stats.percentage)}%</p></div></div><div className="overflow-x-auto"><table className="w-full min-w-[900px]"><thead><tr className="bg-blue-700 text-white"><th className="p-3 text-left">Roll No</th><th className="p-3 text-left">Name</th><th className="p-3 text-left">Series</th><th className="p-3 text-left">Date</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Marked By</th><th className="p-3 text-left">Edited By</th></tr></thead><tbody>{report.map((r,i)=><tr key={r.id} className={i%2===0?"bg-gray-50 border-b":"border-b"}><td className="p-3">{r.roll_no}</td><td className="p-3">{r.name}</td><td className="p-3">{r.test_series_name}</td><td className="p-3">{formatDate(r.attendance_date)}</td><td className="p-3">{r.status}</td><td className="p-3">{r.marked_by||"-"}</td><td className="p-3">{r.edited_by||"-"}</td></tr>)}</tbody></table></div></Card>
  </div>;
}

function DashboardSection({ adminId }) {
  const [series,setSeries]=useState([]),[seriesFilter,setSeriesFilter]=useState(""),[from,setFrom]=useState(""),[to,setTo]=useState(""),[data,setData]=useState(null),[error,setError]=useState("");
  async function load(){try{const p=new URLSearchParams({adminId});if(seriesFilter)p.set("seriesId",seriesFilter);if(from)p.set("from",from);if(to)p.set("to",to);setData(await api("/test-batch/dashboard?"+p.toString()));setError("")}catch(e){setError(e.message)}}
  useEffect(()=>{api("/test-batch/series?adminId="+encodeURIComponent(adminId)).then(d=>setSeries(d.series||[])).catch(e=>setError(e.message))},[adminId]);
  useEffect(()=>{load()},[adminId,seriesFilter,from,to]);
  if(!data)return <Card><Loading/><ErrorText error={error}/></Card>;
  return <div className="space-y-5"><Header title="Test Batch Dashboard" description="Dedicated dashboard for Test Batch Students. Regular Student data is not included."/><Card><div className="flex flex-wrap gap-3"><SeriesSelect series={series} value={seriesFilter} onChange={setSeriesFilter}/><input type="date" className="border rounded-lg px-3 py-2" value={from} onChange={e=>setFrom(e.target.value)}/><input type="date" className="border rounded-lg px-3 py-2" value={to} onChange={e=>setTo(e.target.value)}/><button onClick={load} className="bg-blue-700 text-white px-5 py-2 rounded-lg">Refresh</button></div></Card><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"><Card><p className="text-gray-500">Total Test Batch Students</p><p className="text-3xl font-bold text-blue-800 mt-2">{data.totalStudents}</p></Card><Card><p className="text-gray-500">Attendance %</p><p className="text-3xl font-bold text-green-700 mt-2">{percent(data.attendancePercentage)}%</p></Card><Card><p className="text-gray-500">Marks Average</p><p className="text-3xl font-bold text-blue-800 mt-2">{percent(data.marksPercentage)}%</p></Card><Card><p className="text-gray-500">Recent Additions</p><p className="text-3xl font-bold text-gray-800 mt-2">{data.recentStudents.length}</p></Card></div><Card><Header title="Students by Test Series"/><div className="grid grid-cols-1 md:grid-cols-3 gap-4">{data.seriesCounts.map(s=><div key={s.id} className="border rounded-xl p-5"><p className="text-gray-500">{s.name}</p><p className="text-2xl font-bold text-blue-800 mt-1">{s.count}</p></div>)}</div></Card><Card><Header title="Recent Student Additions"/><div className="overflow-x-auto"><table className="w-full min-w-[700px]"><thead><tr className="bg-blue-700 text-white"><th className="p-3 text-left">Roll No</th><th className="p-3 text-left">Name</th><th className="p-3 text-left">Series</th><th className="p-3 text-left">Added</th></tr></thead><tbody>{data.recentStudents.map((s,i)=><tr key={s.roll_no} className={i%2===0?"bg-gray-50 border-b":"border-b"}><td className="p-3 font-semibold">{s.roll_no}</td><td className="p-3">{s.name}</td><td className="p-3">{s.test_series_name}</td><td className="p-3">{formatDate(s.created_at)}</td></tr>)}</tbody></table></div></Card><ErrorText error={error}/></div>;
}

function StudentDashboardSection({ rollNo }) {
  const [data,setData]=useState(null),[error,setError]=useState("");
  useEffect(()=>{api("/test-batch/student/"+encodeURIComponent(rollNo)).then(setData).catch(e=>setError(e.message))},[rollNo]);
  if(!data)return <Card><Loading/><ErrorText error={error}/></Card>;
  return <div className="space-y-5"><Header title="Test Batch Student Dashboard" description="This dashboard belongs only to the Test Batch category."/><div className="grid grid-cols-1 md:grid-cols-3 gap-4"><Card><p className="text-gray-500">Student</p><p className="text-xl font-bold text-blue-800 mt-1">{data.student.name}</p><p className="text-sm mt-1">{data.student.roll_no}</p></Card><Card><p className="text-gray-500">Test Series</p><p className="text-xl font-bold text-blue-800 mt-1">{data.student.test_series_name}</p></Card><Card><p className="text-gray-500">Attendance</p><p className="text-xl font-bold text-green-700 mt-1">{percent(data.attendancePercentage)}%</p></Card></div><Card><Header title="Marks Overview"/>{data.marks.length===0?<p className="text-gray-500">No marks available yet.</p>:<div className="overflow-x-auto"><table className="w-full min-w-[800px]"><thead><tr className="bg-blue-700 text-white"><th className="p-3 text-left">Test</th><th className="p-3 text-left">Subject</th><th className="p-3 text-left">Marks</th><th className="p-3 text-left">Total</th><th className="p-3 text-left">Percentage</th><th className="p-3 text-left">Result</th></tr></thead><tbody>{data.marks.map((m,i)=><tr key={m.id} className={i%2===0?"bg-gray-50 border-b":"border-b"}><td className="p-3">{m.test_code}</td><td className="p-3">{m.subject_name}</td><td className="p-3">{m.marks_obtained}</td><td className="p-3">{m.total_marks}</td><td className="p-3">{percent(m.percentage)}%</td><td className="p-3">{m.result_status}</td></tr>)}</tbody></table></div>}</Card><Card><Header title="Attendance Overview"/>{data.attendance.length===0?<p className="text-gray-500">No attendance records available yet.</p>:<div className="overflow-x-auto"><table className="w-full min-w-[700px]"><thead><tr className="bg-blue-700 text-white"><th className="p-3 text-left">Date</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Marked By</th></tr></thead><tbody>{data.attendance.map(a=><tr key={a.id} className="border-b"><td className="p-3">{formatDate(a.attendance_date)}</td><td className="p-3">{a.status}</td><td className="p-3">{a.marked_by||"-"}</td></tr>)}</tbody></table></div>}</Card></div>;
}

export default function TestBatchManager({ section = "dashboard", rollNo = "" }) {
  const adminId = useAdminId();
  if(section==="student-dashboard") return <StudentDashboardSection rollNo={rollNo}/>;
  return <AdminGate adminId={adminId}>
    {section==="students" && <StudentsSection adminId={adminId}/>}
    {section==="marks" && <MarksSection adminId={adminId}/>}
    {section==="attendance" && <AttendanceSection adminId={adminId}/>}
    {section==="dashboard" && <DashboardSection adminId={adminId}/>}
  </AdminGate>;
}
