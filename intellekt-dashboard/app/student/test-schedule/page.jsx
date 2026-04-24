"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE = "http://192.168.1.20:5050";

export default function TestSchedulePage() {
  const searchParams = useSearchParams();
  const roll = searchParams.get("roll");

  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);

  const [slotModalOpen, setSlotModalOpen] = useState(false);
  const [selectedTest, setSelectedTest] = useState(null);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [requiresSlot, setRequiresSlot] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [selectedWritingDate, setSelectedWritingDate] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const subjectNameMap = { 1: "Maths", 2: "Physics" };

  useEffect(() => {
    if (!roll) { setLoading(false); return; }

    async function loadTests() {
      try {
        const res = await fetch(`${API_BASE}/test-schedule/${roll}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setTests(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Error loading tests:", err);
        setTests([]);
      } finally {
        setLoading(false);
      }
    }

    loadTests();
  }, [roll]);

  const formatDate = (dateValue) => {
    if (!dateValue) return "-";
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const formatShortDate = (dateValue) => {
    if (!dateValue) return "-";
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  };

  const getTodayOnly = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  };

  const isAfterToday = (dateValue) => {
    if (!dateValue) return false;
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return false;
    date.setHours(0, 0, 0, 0);
    return getTodayOnly() > date;
  };

  const getDaysLeft = (dateValue) => {
    if (!dateValue) return null;
    const today = getTodayOnly();
    const target = new Date(dateValue);
    if (Number.isNaN(target.getTime())) return null;
    target.setHours(0, 0, 0, 0);
    return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
  };

  const isSunday = (dateStr) => new Date(dateStr).getDay() === 0;

  const buildWritingDates = (testDate, writingTill) => {
    if (!testDate || !writingTill) return [];
    const dates = [];
    const start = new Date(testDate);
    const end = new Date(writingTill);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    const current = new Date(start);
    while (current <= end) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  const getTestStatus = (test) => {
    if (test.is_registered) return "registered";
    if (isAfterToday(test.writing_allowed_till)) return "writing_closed";
    if (isAfterToday(test.registration_end_date)) return "registration_closed";
    return "open";
  };

  // Fetch slots whenever writing date changes
  const handleWritingDateChange = async (dateStr) => {
    setSelectedWritingDate(dateStr);
    setSelectedSlot("");
    setAvailableSlots([]);
    setRequiresSlot(false);

    if (!dateStr || !selectedTest) return;

    setLoadingSlots(true);
    try {
      const res = await fetch(
        `${API_BASE}/test-slots/${encodeURIComponent(selectedTest.test_code)}/${encodeURIComponent(roll)}?writing_date=${dateStr}`,
        { cache: "no-store" }
      );
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to load slots");
        return;
      }

      setRequiresSlot(data.requires_slot);
      setAvailableSlots(data.slots || []);
    } catch (err) {
      console.error("Error loading slots:", err);
      alert("Failed to load slots");
    } finally {
      setLoadingSlots(false);
    }
  };

  const openRegisterModal = (test) => {
    const status = getTestStatus(test);

    if (status !== "open") {
      if (status === "registration_closed") alert("Registration is closed for this test");
      else if (status === "writing_closed") alert("Writing period has ended for this test");
      else if (status === "registered") alert("You have already registered for this test");
      return;
    }

    setSelectedTest(test);
    setSelectedSlot("");
    setSelectedWritingDate("");
    setAvailableSlots([]);
    setRequiresSlot(false);
    setSlotModalOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setSlotModalOpen(false);
    setSelectedTest(null);
    setAvailableSlots([]);
    setSelectedSlot("");
    setSelectedWritingDate("");
    setRequiresSlot(false);
    setLoadingSlots(false);
  };

  const handleRegister = async () => {
    if (!selectedTest) return;

    if (!selectedWritingDate) {
      alert("Please select a writing date");
      return;
    }

    // Only require slot selection on Sundays
    if (requiresSlot && !selectedSlot) {
      alert("Please select a slot");
      return;
    }

    let slotStart = null;
    let slotEnd = null;

    if (requiresSlot && selectedSlot) {
      const slotObj = availableSlots.find(
        (slot) => `${slot.start}__${slot.end}` === selectedSlot
      );
      if (!slotObj) {
        alert("Invalid slot selected");
        return;
      }
      slotStart = slotObj.start;
      slotEnd = slotObj.end;
    }

    try {
      setSubmitting(true);

      const res = await fetch(`${API_BASE}/register-test-slot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roll_no: roll,
          test_code: selectedTest.test_code,
          slot_start: slotStart,
          slot_end: slotEnd,
          writing_date: selectedWritingDate,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Registration failed");
        return;
      }

      alert(data.message || "Registered successfully");

      setTests((prev) =>
        prev.map((test) =>
          test.test_code === selectedTest.test_code
            ? {
                ...test,
                is_registered: true,
                writing_date: selectedWritingDate,
                registered_slot_label:
                  slotStart && slotEnd ? `${slotStart} - ${slotEnd}` : "Flexible timing",
              }
            : test
        )
      );

      closeModal();
    } catch (err) {
      console.error("Error registering slot:", err);
      alert("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const renderStatusButton = (test) => {
    const status = getTestStatus(test);

    if (status === "registered") {
      return (
        <div className="flex flex-col items-center gap-1">
          <span className="inline-block bg-green-100 text-green-700 px-3 py-2 rounded-lg font-medium">
            Registered
          </span>
          {test.writing_date && (
            <span className="text-xs text-gray-600">Date: {formatShortDate(test.writing_date)}</span>
          )}
          <span className="text-xs text-gray-600">{test.registered_slot_label || ""}</span>
        </div>
      );
    }

    if (status === "writing_closed") {
      return (
        <span className="inline-block bg-red-100 text-red-700 px-3 py-2 rounded-lg font-medium">
          Writing Closed
        </span>
      );
    }

    if (status === "registration_closed") {
      return (
        <span className="inline-block bg-gray-200 text-gray-700 px-3 py-2 rounded-lg font-medium">
          Registration Closed
        </span>
      );
    }

    return (
      <button
        onClick={() => openRegisterModal(test)}
        className="inline-block bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700"
      >
        Register
      </button>
    );
  };

  if (loading) return <p className="p-4">Loading...</p>;

  return (
    <div className="p-4 md:p-10">
      <h2 className="text-2xl md:text-3xl font-bold mb-6">Test Schedule</h2>

      <div className="bg-white rounded-xl shadow p-4 md:p-6">
        <div className="overflow-x-auto">
          <table className="min-w-full border text-sm md:text-base rounded-xl overflow-hidden">
            <thead className="bg-[#2c3e50] text-white">
              <tr>
                <th className="p-3 whitespace-nowrap">Subject</th>
                <th className="p-3 whitespace-nowrap">Date</th>
                <th className="p-3 whitespace-nowrap">Portion</th>
                <th className="p-3 whitespace-nowrap">Marks</th>
                <th className="p-3 whitespace-nowrap">Register</th>
              </tr>
            </thead>
            <tbody>
              {tests.length > 0 ? (
                tests.map((t, i) => {
                  const subjectLabel = subjectNameMap[t.subject_id] || t.subject_id || "-";
                  return (
                    <tr key={t.test_code || i} className={`text-center border-b ${i % 2 === 0 ? "bg-gray-50" : "bg-white"}`}>
                      <td className="p-3 whitespace-nowrap">{subjectLabel}</td>
                      <td className="p-3 whitespace-nowrap">{formatDate(t.test_date)}</td>
                      <td className="p-3 whitespace-nowrap">{t.portion || "-"}</td>
                      <td className="p-3 whitespace-nowrap">{t.total_marks ?? "-"}</td>
                      <td className="p-3 whitespace-nowrap">{renderStatusButton(t)}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="5" className="p-4 text-center text-gray-500">No tests available</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {slotModalOpen && selectedTest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-xl font-bold text-blue-800 mb-4">Register Test Slot</h3>

            <div className="space-y-3 text-sm md:text-base mb-5">
              <p>
                <span className="font-semibold">Subject:</span>{" "}
                {subjectNameMap[selectedTest.subject_id] || selectedTest.subject_id || "-"}
              </p>
              <p><span className="font-semibold">Test Date:</span> {formatDate(selectedTest.test_date)}</p>
              <p><span className="font-semibold">Duration:</span> {selectedTest.duration_minutes ? `${selectedTest.duration_minutes} mins` : "-"}</p>
              <p><span className="font-semibold">Roll No:</span> {roll || "-"}</p>

              {(() => {
                const daysLeft = getDaysLeft(selectedTest.registration_end_date);
                if (daysLeft === null) return null;
                if (daysLeft < 0) return <p className="text-red-600 font-semibold">Registration closed</p>;
                if (daysLeft === 0) return <p className="text-red-600 font-semibold">Last day for registration</p>;
                return <p className="text-red-600 font-semibold">{daysLeft} day{daysLeft > 1 ? "s" : ""} left for registration</p>;
              })()}
            </div>

            {/* Writing Date Picker - always shown */}
            <div className="mb-5">
              <label className="block mb-2 font-semibold text-gray-700">Select Writing Date</label>
              <select
                value={selectedWritingDate}
                onChange={(e) => handleWritingDateChange(e.target.value)}
                className="w-full border rounded-lg px-4 py-3 text-gray-700 bg-white"
              >
                <option value="">Choose date</option>
                {buildWritingDates(selectedTest.test_date, selectedTest.writing_allowed_till).map((date, index) => {
                  const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                  const dayName = date.toLocaleDateString("en-IN", { weekday: "short" });
                  const label = date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
                  return (
                    <option key={index} value={value}>
                      {label} ({dayName})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Slot picker - only shown for Sundays */}
            {selectedWritingDate && (
              loadingSlots ? (
                <p className="text-gray-500 mb-5">Loading slots...</p>
              ) : requiresSlot ? (
                availableSlots.length === 0 ? (
                  <p className="text-red-600 font-medium mb-5">No available slots for this date.</p>
                ) : (
                  <div className="mb-5">
                    <label className="block mb-2 font-semibold text-gray-700">Select Slot</label>
                    <select
                      value={selectedSlot}
                      onChange={(e) => setSelectedSlot(e.target.value)}
                      className="w-full border rounded-lg px-4 py-3 text-gray-700 bg-white"
                    >
                      <option value="">Choose slot</option>
                      {availableSlots.map((slot, index) => (
                        <option key={index} value={`${slot.start}__${slot.end}`}>
                          {slot.start} - {slot.end}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              ) : (
                <p className="text-green-700 font-medium mb-5 bg-green-50 px-4 py-3 rounded-lg">
                  No slot booking needed.
                </p>
              )
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={closeModal}
                disabled={submitting}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRegister}
                disabled={
                  submitting ||
                  !selectedWritingDate ||
                  loadingSlots ||
                  (requiresSlot && (!selectedSlot || availableSlots.length === 0))
                }
                className="px-4 py-2 rounded-lg bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Confirm Registration"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}