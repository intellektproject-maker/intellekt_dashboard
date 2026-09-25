"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://responsible-wonder-production.up.railway.app";

const ADMIN_IDS=["IG001","IG002"];

async function api(path,options={}){
  const r=await fetch(API_BASE+path,{cache:"no-store",...options,headers:{"Content-Type":"application/json",...(options.headers||{})}});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||"Request failed");
  return d;
}
function Card({children,className=""}){return <div className={"bg-white shadow-md rounded-xl border border-gray-200 p-6 "+className}>{children}</div>}
function formatDate(v){if(!v)return "-";const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString("en-IN")}
function emptyForm(seriesId=""){return {test_code:"",test_series_id:seriesId,subject_name:"",test_date:"",writing_date:"",slot_start:"",slot_end:"",duration_minutes:"",total_marks:"",portion:"",chapter:"",application_open_date:"",application_close_date:"",status:"Scheduled"}}

export default function TestBatchTestManagement(){
  const params=useSearchParams();
  const adminId=(params.get("id")||"").toUpperCase().trim();
  const [series,setSeries]=useState([]);
  const [tests,setTests]=useState([]);
  const [section,setSection]=useState("");
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState(emptyForm());
  const [results,setResults]=useState([]);
  const [resultTest,setResultTest]=useState("");
  const [search,setSearch]=useState("");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");

  const authorized=ADMIN_IDS.includes(adminId);

  async function loadSeries(){
    const d=await api("/test-batch/series?adminId="+encodeURIComponent(adminId));
    setSeries(d.series||[]);
    setForm(f=>({...f,test_series_id:f.test_series_id||(d.series?.[0]?String(d.series[0].id):"")}));
  }
  async function loadTests(){
    setLoading(true);
    try{
      const q=new URLSearchParams({adminId});
      if(search.trim())q.set("search",search.trim());
      const d=await api("/test-batch/tests?"+q.toString());
      setTests(d.tests||[]);
      setError("");
    }catch(e){setError(e.message)}
    finally{setLoading(false)}
  }
  useEffect(()=>{if(authorized)loadSeries().catch(e=>setError(e.message))},[adminId,authorized]);
  useEffect(()=>{if(authorized){const t=setTimeout(loadTests,150);return()=>clearTimeout(t)}},[adminId,authorized,search]);

  function openCreate(){
    setEditing(null);
    setForm(emptyForm(series[0]?String(series[0].id):""));
    setSection("create");
    setError("");
  }
  function openEdit(t){
    setEditing(t.id);
    setForm({
      test_code:t.test_code||"",test_series_id:String(t.test_series_id||""),
      subject_name:t.subject_name||"",test_date:String(t.test_date||"").slice(0,10),
      writing_date:String(t.writing_date||"").slice(0,10),slot_start:t.slot_start||"",slot_end:t.slot_end||"",
      duration_minutes:t.duration_minutes||"",total_marks:t.total_marks||"",portion:t.portion||"",chapter:t.chapter||"",
      application_open_date:String(t.application_open_date||"").slice(0,10),
      application_close_date:String(t.application_close_date||"").slice(0,10),status:t.status||"Scheduled"
    });
    setSection("settings");
    setError("");
  }
  function update(k,v){setForm(f=>({...f,[k]:v}))}

  async function saveTest(e){
    e.preventDefault();
    setSaving(true);setError("");
    try{
      if(!form.test_code||!form.test_series_id||!form.subject_name||!form.test_date||!form.writing_date||!form.duration_minutes||!form.total_marks)
        throw new Error("Complete the required Test Batch test fields.");
      const payload={...form,adminId,test_series_id:Number(form.test_series_id),duration_minutes:Number(form.duration_minutes),total_marks:Number(form.total_marks)};
      if(editing) await api("/test-batch/tests/"+editing,{method:"PUT",body:JSON.stringify(payload)});
      else await api("/test-batch/tests",{method:"POST",body:JSON.stringify(payload)});
      setSection("list");setEditing(null);setForm(emptyForm(series[0]?String(series[0].id):""));
      await loadTests();
    }catch(e){setError(e.message)}
    finally{setSaving(false)}
  }

  async function deleteTest(t){
    if(!window.confirm("Delete Test Batch test "+t.test_code+"?"))return;
    try{await api("/test-batch/tests/"+t.id,{method:"DELETE",body:JSON.stringify({adminId})});await loadTests()}
    catch(e){setError(e.message)}
  }

  async function loadResults(code){
    if(!code){setResults([]);return}
    try{const d=await api("/test-batch/tests/"+encodeURIComponent(code)+"/results?adminId="+encodeURIComponent(adminId));setResults(d.results||[]);setError("")}
    catch(e){setError(e.message)}
  }
  useEffect(()=>{if(section==="results")loadResults(resultTest)},[section,resultTest]);

  const filtered=useMemo(()=>tests.filter(t=>!search.trim()||String(t.test_code).toLowerCase().includes(search.trim().toLowerCase())||String(t.subject_name).toLowerCase().includes(search.trim().toLowerCase())),[tests,search]);
  function exportTests(){
    if(!filtered.length){alert("No Test Batch tests to export");return;}
    const html='<table border="1"><tr><th>Test Code</th><th>Test Batch</th><th>Subject</th><th>Test Date</th><th>Writing Date</th><th>Slot</th><th>Total Marks</th><th>Status</th></tr>'+filtered.map(t=>'<tr><td>'+t.test_code+'</td><td>'+t.test_series_name+'</td><td>'+t.subject_name+'</td><td>'+formatDate(t.test_date)+'</td><td>'+formatDate(t.writing_date)+'</td><td>'+((t.slot_start||"-")+" - "+(t.slot_end||"-"))+'</td><td>'+t.total_marks+'</td><td>'+t.status+'</td></tr>').join("")+'</table>';
    const blob=new Blob([html],{type:"application/vnd.ms-excel"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="test_batch_test_list.xls";a.click();URL.revokeObjectURL(url);
  }


  if(!authorized)return null;

  return <div className="mt-12 border-t-4 border-blue-700 pt-8 space-y-6">
    <div>
      <h2 className="text-2xl md:text-3xl font-bold text-blue-800">Test Batch</h2>
      <p className="text-gray-600 mt-2">Test management dedicated exclusively to Test Batch students. Regular Student tests remain unchanged.</p>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
      <button onClick={openCreate} className="text-left bg-white shadow-md rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:scale-[1.02] transition">
        <h3 className="text-lg font-semibold text-blue-700 mb-2">Test Batch – Create Test</h3>
        <p className="text-gray-600">Create a test for a selected Test Series with writing date, slot and application window.</p>
      </button>
      <button onClick={()=>setSection("list")} className="text-left bg-white shadow-md rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:scale-[1.02] transition">
        <h3 className="text-lg font-semibold text-blue-700 mb-2">Test Batch – Test List</h3>
        <p className="text-gray-600">View, search, edit and delete Test Batch tests.</p>
      </button>
      <button onClick={()=>setSection("settings")} className="text-left bg-white shadow-md rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:scale-[1.02] transition">
        <h3 className="text-lg font-semibold text-blue-700 mb-2">Test Batch – Test Settings</h3>
        <p className="text-gray-600">Manage test date, slot, marks, portion, chapter and application settings.</p>
      </button>
      <button onClick={()=>setSection("results")} className="text-left bg-white shadow-md rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:scale-[1.02] transition">
        <h3 className="text-lg font-semibold text-blue-700 mb-2">Test Batch – Results</h3>
        <p className="text-gray-600">View Test Batch students and their marks for a selected test.</p>
      </button>
    </div>

    {error&&<div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4">{error}</div>}

    {section==="create"||section==="settings" ? <Card>
      <div className="flex items-center justify-between mb-5">
        <div><h3 className="text-xl font-bold text-blue-800">{editing?"Test Batch – Test Settings":"Test Batch – Create Test"}</h3><p className="text-sm text-gray-500 mt-1">Only Test Batch data is written by this form.</p></div>
        <button onClick={()=>{setSection("");setEditing(null)}} className="px-4 py-2 bg-gray-100 rounded-lg">Close</button>
      </div>
      <form onSubmit={saveTest} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input className="border rounded-lg px-4 py-3" placeholder="Test Code *" value={form.test_code} onChange={e=>update("test_code",e.target.value.toUpperCase())} disabled={!!editing}/>
        <select className="border rounded-lg px-4 py-3 bg-white" value={form.test_series_id} onChange={e=>update("test_series_id",e.target.value)}><option value="">Select Test Batch / Series *</option>{series.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select className="border rounded-lg px-4 py-3 bg-white" value={form.subject_name} onChange={e=>update("subject_name",e.target.value)}><option value="">Select Subject *</option><option>Mathematics</option><option>Physics</option></select>
        <select className="border rounded-lg px-4 py-3 bg-white" value={form.status} onChange={e=>update("status",e.target.value)}><option>Draft</option><option>Scheduled</option><option>Active</option><option>Completed</option><option>Cancelled</option></select>
        <label className="text-sm text-gray-600">Test Date *<input type="date" className="block w-full border rounded-lg px-4 py-3 mt-1" value={form.test_date} onChange={e=>update("test_date",e.target.value)}/></label>
        <label className="text-sm text-gray-600">Writing Date *<input type="date" className="block w-full border rounded-lg px-4 py-3 mt-1" value={form.writing_date} onChange={e=>update("writing_date",e.target.value)}/></label>
        <label className="text-sm text-gray-600">Test Slot Start<input type="time" className="block w-full border rounded-lg px-4 py-3 mt-1" value={form.slot_start} onChange={e=>update("slot_start",e.target.value)}/></label>
        <label className="text-sm text-gray-600">Test Slot End<input type="time" className="block w-full border rounded-lg px-4 py-3 mt-1" value={form.slot_end} onChange={e=>update("slot_end",e.target.value)}/></label>
        <input type="number" min="1" className="border rounded-lg px-4 py-3" placeholder="Duration (minutes) *" value={form.duration_minutes} onChange={e=>update("duration_minutes",e.target.value)}/>
        <input type="number" min="1" className="border rounded-lg px-4 py-3" placeholder="Total Marks *" value={form.total_marks} onChange={e=>update("total_marks",e.target.value)}/>
        <input className="border rounded-lg px-4 py-3" placeholder="Portion" value={form.portion} onChange={e=>update("portion",e.target.value)}/>
        <input className="border rounded-lg px-4 py-3" placeholder="Chapter" value={form.chapter} onChange={e=>update("chapter",e.target.value)}/>
        <label className="text-sm text-gray-600">Apply for Test – Open Date<input type="date" className="block w-full border rounded-lg px-4 py-3 mt-1" value={form.application_open_date} onChange={e=>update("application_open_date",e.target.value)}/></label>
        <label className="text-sm text-gray-600">Apply for Test – Close Date<input type="date" className="block w-full border rounded-lg px-4 py-3 mt-1" value={form.application_close_date} onChange={e=>update("application_close_date",e.target.value)}/></label>
        <div className="md:col-span-2 flex gap-3">
          <button disabled={saving} className="bg-blue-700 text-white px-6 py-3 rounded-lg disabled:opacity-50">{saving?"Saving...":editing?"Update Test":"Create Test"}</button>
          {editing&&<button type="button" onClick={()=>setSection("list")} className="bg-gray-500 text-white px-6 py-3 rounded-lg">Cancel</button>}
        </div>
      </form>
    </Card>:null}

    {section==="list"&&<Card>
      <div className="flex flex-wrap gap-3 items-center mb-5">
        <h3 className="text-xl font-bold text-blue-800 mr-auto">Test Batch – Test List</h3>
        <input className="border rounded-lg px-4 py-2" placeholder="Search test code / subject" value={search} onChange={e=>setSearch(e.target.value)}/>
        <button onClick={exportTests} className="bg-gray-700 text-white px-5 py-2 rounded-lg">Export</button><button onClick={openCreate} className="bg-blue-700 text-white px-5 py-2 rounded-lg">Create Test</button>
      </div>
      {loading?<p className="text-gray-500">Loading...</p>:filtered.length===0?<p className="text-gray-500">No Test Batch tests found.</p>:
      <div className="overflow-x-auto"><table className="w-full min-w-[1200px]"><thead className="bg-blue-700 text-white"><tr><th className="p-3 text-left">Code</th><th className="p-3 text-left">Test Batch</th><th className="p-3 text-left">Subject</th><th className="p-3 text-left">Test Date</th><th className="p-3 text-left">Writing Date</th><th className="p-3 text-left">Slot</th><th className="p-3 text-left">Marks</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Actions</th></tr></thead><tbody>{filtered.map((t,i)=><tr key={t.id} className={i%2===0?"bg-gray-50 border-b":"border-b"}><td className="p-3 font-semibold text-blue-700">{t.test_code}</td><td className="p-3">{t.test_series_name}</td><td className="p-3">{t.subject_name}</td><td className="p-3">{formatDate(t.test_date)}</td><td className="p-3">{formatDate(t.writing_date)}</td><td className="p-3">{t.slot_start||"-"} - {t.slot_end||"-"}</td><td className="p-3">{t.total_marks}</td><td className="p-3">{t.status}</td><td className="p-3 flex gap-2"><button onClick={()=>openEdit(t)} className="bg-yellow-500 text-white px-3 py-1 rounded">Edit</button><button onClick={()=>deleteTest(t)} className="bg-red-600 text-white px-3 py-1 rounded">Delete</button></td></tr>)}</tbody></table></div>}
    </Card>}

    {section==="results"&&<Card>
      <h3 className="text-xl font-bold text-blue-800 mb-4">Test Batch – Results</h3>
      <div className="flex gap-3 mb-5"><select className="border rounded-lg px-4 py-3 flex-1 bg-white" value={resultTest} onChange={e=>setResultTest(e.target.value)}><option value="">Select Test</option>{tests.map(t=><option key={t.test_code} value={t.test_code}>{t.test_code} — {t.test_series_name} — {t.subject_name}</option>)}</select></div>
      {!resultTest?<p className="text-gray-500">Select a Test Batch test to view results.</p>:results.length===0?<p className="text-gray-500">No marks found for this Test Batch test.</p>:
      <div className="overflow-x-auto"><table className="w-full min-w-[800px]"><thead className="bg-blue-700 text-white"><tr><th className="p-3 text-left">Roll No</th><th className="p-3 text-left">Student</th><th className="p-3 text-left">Subject</th><th className="p-3 text-left">Marks</th><th className="p-3 text-left">Total</th><th className="p-3 text-left">Result</th></tr></thead><tbody>{results.map((r,i)=>{const absent=String(r.marks_obtained).toUpperCase()==="A";const pct=absent?null:(Number(r.marks_obtained)/Number(r.total_marks))*100;return <tr key={r.id} className={i%2===0?"bg-gray-50 border-b":"border-b"}><td className="p-3 font-semibold">{r.roll_no}</td><td className="p-3">{r.name}</td><td className="p-3">{r.subject_name}</td><td className="p-3">{r.marks_obtained}</td><td className="p-3">{r.total_marks}</td><td className="p-3">{absent?"Absent":pct>=40?"Pass":"Fail"}</td></tr>})}</tbody></table></div>}
    </Card>}
  </div>;
}
