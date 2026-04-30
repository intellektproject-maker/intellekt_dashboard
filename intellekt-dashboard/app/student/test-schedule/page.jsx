"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE = "/backend-api";

function TestScheduleContent() {
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
    if (!roll) {
      setLoading(false);
      return;
    }

    async function loadTests() {
      try {
        const res = await fetch(`${API_BASE}/test-schedule/${roll}`, {
          cache: "no-store",
        });

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

    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatInputDate = (dateValue) => {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "";

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
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

  const handleWritingDateChange = async (dateStr) => {
    setSelectedWritingDate(dateStr);
    setSelectedSlot("");
    setAvailableSlots([]);
    setRequiresSlot(false);

    if (!dateStr || !selectedTest) return;

    setLoadingSlots(true);

    try {
      const res = await fetch(
        `${API_BASE}/test-slots/${encodeURIComponent(
          selectedTest.test_code
        )}/${encodeURIComponent(roll)}?writing_date=${dateStr}`,
        { cache: "no-store" }
      );

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to load slots");
        return;
      }

      setRequiresSlot(Boolean(data.requires_slot));
      setAvailableSlots(Array.isArray(data.slots) ? data.slots : []);
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
        <div className="flex flex-col items-start gap-1">
          <span className="bg-green-100 text-green-700 px-3 py-2 rounded-lg font-medium">
            Registered
          </span>
          {test.writing_date && (
            <span className="text-xs text-gray-600">
              Date: {formatDate(test.writing_date)}
            </span>
          )}
          {test.registered_slot_label && (
            <span className="text-xs text-gray-600">{test.registered_slot_label}</span>
          )}
        </div>
      );
    }

    if (status === "writing_closed") {
      return (
        <span className="bg-red-100 text-red-700 px-3 py-2 rounded-lg font-medium">
          Writing Closed
        </span>
      );
    }

    if (status === "registration_closed") {
      return (
        <span className="bg-gray-200 text-gray-700 px-3 py-2 rounded-lg font-medium">
          Registration Closed
        </span>
      );
    }

    return (
      <button
        onClick={() => openRegisterModal(test)}
        className="bg-blue-700 text-white px-4 py-2 rounded-lg hover:bg-blue-800 transition"
      >
        Register
      </button>
    );
  };

  if (loading) {
    return <p className="p-6 text-gray-600">Loading...</p>;
  }

  return (
    <div className="p-6 md:p-10 bg-gray-100 min-h-screen">
      <h1 className="text-2xl md:text-3xl font-bold text-blue-800 mb-8">
        Test Schedule
      </h1>

      {tests.length === 0 ? (
        <div className="bg-white shadow-md rounded-xl border border-gray-200 p-6">
          <p className="text-gray-600">No tests scheduled.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {tests.map((test, index) => {
            const daysLeft = getDaysLeft(test.registration_end_date);

            return (
              <div
                key={test.test_code || index}
                className="bg-white shadow-md rounded-xl border border-gray-200 p-6 hover:shadow-lg transition duration-200"
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-blue-700 mb-2">
                      {test.test_code || "Test"}
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-2 text-gray-600">
                      <p>
                        <span className="font-medium">Subject:</span>{" "}
                        {test.subject_name ||
                          subjectNameMap[test.subject_id] ||
                          "-"}
                      </p>

                      <p>
                        <span className="font-medium">Test Date:</span>{" "}
                        {formatDate(test.test_date)}
                      </p>

                      <p>
                        <span className="font-medium">Total Marks:</span>{" "}
                        {test.total_marks ?? "-"}
                      </p>

                      <p>
                        <span className="font-medium">Duration:</span>{" "}
                        {test.duration_minutes
                          ? `${test.duration_minutes} mins`
                          : "-"}
                      </p>

                      <p>
                        <span className="font-medium">Registration Ends:</span>{" "}
                        {formatDate(test.registration_end_date)}
                      </p>

                      <p>
                        <span className="font-medium">Writing Allowed Till:</span>{" "}
                        {formatDate(test.writing_allowed_till)}
                      </p>
                    </div>

                    {test.portion && (
                      <p className="mt-3 text-gray-600">
                        <span className="font-medium">Portion:</span> {test.portion}
                      </p>
                    )}

                    {daysLeft !== null && getTestStatus(test) === "open" && (
                      <p
                        className={`mt-3 text-sm font-medium ${
                          daysLeft <= 1 ? "text-red-600" : "text-blue-700"
                        }`}
                      >
                        {daysLeft === 0
                          ? "Registration closes today"
                          : `${daysLeft} day(s) left for registration`}
                      </p>
                    )}
                  </div>

                  <div className="md:min-w-[180px]">{renderStatusButton(test)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {slotModalOpen && selectedTest && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-blue-700 mb-4">
              Register Test
            </h2>

            <p className="text-gray-600 mb-2">
              <span className="font-medium">Test Code:</span>{" "}
              {selectedTest.test_code}
            </p>

            <p className="text-gray-600 mb-4">
              <span className="font-medium">Subject:</span>{" "}
              {selectedTest.subject_name ||
                subjectNameMap[selectedTest.subject_id] ||
                "-"}
            </p>

            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Writing Date
            </label>

            <select
              value={selectedWritingDate}
              onChange={(e) => handleWritingDateChange(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 mb-4"
            >
              <option value="">Choose date</option>
              {buildWritingDates(
                selectedTest.test_date,
                selectedTest.writing_allowed_till
              ).map((date) => {
                const value = formatInputDate(date);

                return (
                  <option key={value} value={value}>
                    {formatDate(date)}
                  </option>
                );
              })}
            </select>

            {loadingSlots && (
              <p className="text-gray-500 mb-4">Loading slots...</p>
            )}

            {!loadingSlots && selectedWritingDate && requiresSlot && (
              <>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Slot
                </label>

                <select
                  value={selectedSlot}
                  onChange={(e) => setSelectedSlot(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 mb-4"
                >
                  <option value="">Choose slot</option>
                  {availableSlots.map((slot, index) => (
                    <option
                      key={index}
                      value={`${slot.start}__${slot.end}`}
                    >
                      {slot.start} - {slot.end}
                    </option>
                  ))}
                </select>

                {availableSlots.length === 0 && (
                  <p className="text-red-600 text-sm mb-4">
                    No slots available for this date.
                  </p>
                )}
              </>
            )}

            {!loadingSlots && selectedWritingDate && !requiresSlot && (
              <p className="text-gray-600 mb-4">
                Slot selection is not required for this test.
              </p>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={closeModal}
                disabled={submitting}
                className="px-4 py-2 rounded-lg border text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>

              <button
                onClick={handleRegister}
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {submitting ? "Registering..." : "Register"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TestSchedulePage() {
  return (
    <Suspense fallback={<p className="p-4">Loading...</p>}>
      <TestScheduleContent />
    </Suspense>
  );
}