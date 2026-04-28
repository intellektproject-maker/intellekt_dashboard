"use client";

import { useState, useRef } from "react";
import html2pdf from "html2pdf.js";

export default function ManageMarks() {
  const [name, setName] = useState("");
  const [className, setClassName] = useState("");
  const [testCode, setTestCode] = useState("");

  const [marksData, setMarksData] = useState([]);
  const [editingRow, setEditingRow] = useState(null);
  const [newMarks, setNewMarks] = useState("");

  const pdfRef = useRef();

  const fetchMarks = async () => {
    try {
      const params = new URLSearchParams({
        name,
        className,
        testCode
      });

      const res = await fetch(`http://192.168.1.26:5050/marks?${params}`);
      const data = await res.json();

      setMarksData(data);
    } catch (err) {
      console.error("Error fetching marks:", err);
    }
  };

  const startEdit = (rowIndex, row) => {
    setEditingRow(rowIndex);
    setNewMarks(row.marks_obtained);
  };

  const updateMarks = async (row) => {
    const confirmEdit = confirm("Confirm updating this mark?");
    if (!confirmEdit) return;

    try {
      await fetch(
        `http://192.168.1.26:5050/marks/${row.roll_no}/${row.test_code}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ marks: newMarks })
        }
      );

      setEditingRow(null);
      fetchMarks();
    } catch (err) {
      console.error("Update failed", err);
    }
  };

  const generatePDF = () => {
    const element = pdfRef.current;

    const opt = {
      margin: 10,
      filename: `${className || "marks"}-report.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
    };

    html2pdf().set(opt).from(element).save();
  };

  return (
    <div className="p-6 md:p-10">
      <h1 className="text-2xl md:text-3xl font-bold text-blue-700 mb-6">
        Manage Marks
      </h1>

      <div className="bg-white shadow-md rounded-xl p-6 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <input
            placeholder="Student Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border rounded-lg px-4 py-3 w-full md:w-auto text-gray-700"
          />

          <select
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            className="border rounded-lg px-4 py-3 w-full md:w-auto text-gray-700"
          >
            <option value="">All Classes</option>
            <option value="CBSE-12">CBSE-12</option>
            <option value="CBSE-10">CBSE-10</option>
            <option value="ISC-12">ISC-12</option>
            <option value="SB-12">SB-12</option>
            <option value="SB-10">SB-10</option>
            <option value="ICSE-10">ICSE-10</option>
          </select>

          <input
            placeholder="Test Code"
            value={testCode}
            onChange={(e) => setTestCode(e.target.value)}
            className="border rounded-lg px-4 py-3 w-full md:w-auto text-gray-700"
          />

          <div className="flex gap-2">
            <button
              onClick={fetchMarks}
              className="bg-blue-700 text-white px-5 py-3 rounded-lg hover:bg-blue-800"
            >
              Search
            </button>

            <button
              onClick={generatePDF}
              className="bg-red-600 text-white px-4 py-3 rounded-lg flex items-center gap-2"
            >
              📄 Convert to PDF
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto bg-white shadow-md rounded-xl p-6">
        <table className="w-full min-w-[700px] border-collapse">
          <thead className="bg-blue-700 text-white">
            <tr>
              <th className="p-3 text-left">Student Name</th>
              <th className="p-3 text-left">Class</th>
              <th className="p-3 text-left">Test Code</th>
              <th className="p-3 text-left">Marks</th>
              <th className="p-3 text-left">Action</th>
            </tr>
          </thead>

          <tbody>
            {marksData.map((m, i) => (
              <tr key={i} className="border-b text-gray-700">
                <td className="p-3">{m.name}</td>
                <td className="p-3">{m.class}</td>
                <td className="p-3">{m.test_code}</td>

                <td className="p-3">
                  {editingRow === i ? (
                    <input
                      type="number"
                      value={newMarks}
                      onChange={(e) => setNewMarks(e.target.value)}
                      className="border rounded-lg px-2 py-1 w-20 text-center"
                    />
                  ) : (
                    m.marks_obtained
                  )}
                </td>

                <td className="p-3">
                  {editingRow === i ? (
                    <>
                      <button
                        onClick={() => updateMarks(m)}
                        className="bg-green-600 text-white px-3 py-1 rounded-lg mr-2 hover:bg-green-700"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingRow(null)}
                        className="bg-gray-500 text-white px-3 py-1 rounded-lg hover:bg-gray-600"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => startEdit(i, m)}
                      className="bg-yellow-500 text-white px-3 py-1 rounded-lg hover:bg-yellow-600"
                    >
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ position: "absolute", left: "-9999px", top: 0 }}>
        <div ref={pdfRef} className="p-10 bg-white text-black">
          <h2 className="text-2xl font-bold mb-6">
            {className ? `${className} - Marks Report` : "Marks Report"}
          </h2>

          <table className="w-full border border-black text-center">
            <thead>
              <tr>
                <th className="p-2 border">Student Name</th>
                <th className="p-2 border">Class</th>
                <th className="p-2 border">Test Code</th>
                <th className="p-2 border">Marks</th>
              </tr>
            </thead>

            <tbody>
              {marksData.map((m, i) => (
                <tr key={i}>
                  <td className="p-2 border">{m.name}</td>
                  <td className="p-2 border">{m.class}</td>
                  <td className="p-2 border">{m.test_code}</td>
                  <td className="p-2 border">{m.marks_obtained}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-6 text-sm">Auto generated report</p>
        </div>
      </div>
    </div>
  );
}