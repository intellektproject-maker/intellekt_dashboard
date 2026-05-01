"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  MapPin,
  Mail,
  Phone,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  BookOpen,
  Users,
  Award,
  TrendingUp,
} from "lucide-react";

const cards = [
  {
    title: (
      <>
        Empowering the
        <br />
        Future of
        <br />
        Academic
        <br />
        Excellence
      </>
    ),
    description:
      "Intellekt Academy is designed to redefine academic management with secure dashboards, performance tracking, simplified workflows, and a modern digital learning environment.",
    image: "/slide1.png",
    alt: "Academic excellence",
  },
  {
    title: <>About Us</>,
    description:
      "Intellekt Academy is a modern student management platform designed to simplify workflows and enhance performance tracking.",
    image: "/slide2.png",
    alt: "About Intellekt Academy",
  },
];

const stats = [
  { icon: Users, label: "Students Enrolled", value: "500+" },
  { icon: BookOpen, label: "Subjects Offered", value: "3" },
  { icon: Award, label: "Success Rate", value: "98%" },
  { icon: TrendingUp, label: "Years of Excellence", value: "5+" },
];

const API_BASE = "https://responsible-wonder-production.up.railway.app";

export default function Home() {
  const router = useRouter();

  const [currentCard, setCurrentCard] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const contactRef = useRef<HTMLDivElement>(null);
  const enquiryRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    studentName: "",
    className: "",
    board: "",
    schoolName: "",
    subjects: "",
    modeOfEducation: "",
    parentName: "",
    mobileNumber: "",
    area: "",
  });

  const [phoneError, setPhoneError] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentCard((prev) => (prev + 1) % cards.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const goPrev = () => setCurrentCard((prev) => (prev - 1 + cards.length) % cards.length);
  const goNext = () => setCurrentCard((prev) => (prev + 1) % cards.length);

  const scrollToSection = (ref: React.RefObject<HTMLDivElement>) => {
    if (!ref.current) return;
    const headerOffset = 100;
    const elementPosition = ref.current.getBoundingClientRect().top + window.pageYOffset;
    window.scrollTo({ top: elementPosition - headerOffset, behavior: "smooth" });
  };

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  const sanitizeName = (value: string) =>
    value.replace(/[^A-Za-z\s]/g, "").replace(/\s{2,}/g, " ").replace(/^\s+/, "");

  const sanitizeSchoolName = (value: string) =>
    value.replace(/[^A-Za-z0-9\s.,&()'-]/g, "").replace(/\s{2,}/g, " ").replace(/^\s+/, "");

  const sanitizeArea = (value: string) =>
    value.replace(/[^A-Za-z0-9\s,.-]/g, "").replace(/\s{2,}/g, " ").replace(/^\s+/, "");

  const sanitizePhone = (value: string) => value.replace(/\D/g, "").slice(0, 10);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let cleanedValue = value;

    if (name === "studentName" || name === "parentName") cleanedValue = sanitizeName(value);
    else if (name === "schoolName") cleanedValue = sanitizeSchoolName(value);
    else if (name === "area") cleanedValue = sanitizeArea(value);
    else if (name === "mobileNumber") {
      cleanedValue = sanitizePhone(value);
      if (cleanedValue.length > 0 && cleanedValue.length !== 10) {
        setPhoneError("Phone number must contain exactly 10 digits");
      } else {
        setPhoneError("");
      }
    }

    setFormData((prev) => ({ ...prev, [name]: cleanedValue }));
  };

  const validateForm = () => {
    const studentName = formData.studentName.trim();
    const parentName = formData.parentName.trim();
    const schoolName = formData.schoolName.trim();
    const area = formData.area.trim();
    const mobileNumber = formData.mobileNumber.trim();

    if (!studentName || !/^[A-Za-z\s]+$/.test(studentName)) {
      alert("Student name should contain only letters and spaces.");
      return false;
    }
    if (!formData.className) { alert("Please select class."); return false; }
    if (!formData.board) { alert("Please select board."); return false; }
    if (!schoolName || !/^[A-Za-z0-9\s.,&()'-]+$/.test(schoolName)) {
      alert("School name should not be empty and should contain only valid characters.");
      return false;
    }
    if (!formData.subjects) { alert("Please select subject."); return false; }
    if (!formData.modeOfEducation) { alert("Please select mode of education."); return false; }
    if (!parentName || !/^[A-Za-z\s]+$/.test(parentName)) {
      alert("Parent name should contain only letters and spaces.");
      return false;
    }
    if (!/^\d{10}$/.test(mobileNumber)) {
      setPhoneError("Phone number must contain exactly 10 digits");
      alert("Phone number must contain exactly 10 digits.");
      return false;
    }
    if (!area || !/^[A-Za-z0-9\s,.-]+$/.test(area)) {
      alert("Area should contain only valid characters.");
      return false;
    }
    return true;
  };

  const handleEnquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    const classBoard = `${formData.board}-${formData.className}`;

    try {
      const res = await fetch(`${API_BASE}/enquiries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName: formData.studentName.trim(),
          classBoard,
          schoolName: formData.schoolName.trim(),
          subjects: formData.subjects,
          modeOfEducation: formData.modeOfEducation,
          parentName: formData.parentName.trim(),
          mobileNumber: formData.mobileNumber.trim(),
          area: formData.area.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.message || data.error || "Failed to submit enquiry");
        return;
      }

      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 4000);
      setFormData({
        studentName: "", className: "", board: "", schoolName: "",
        subjects: "", modeOfEducation: "", parentName: "", mobileNumber: "", area: "",
      });
      setPhoneError("");
    } catch (error) {
      console.error("Enquiry error:", error);
      alert("Server error while submitting enquiry");
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = (hasError = false) =>
    `w-full border-2 rounded-xl px-4 py-3 outline-none text-sm transition-all duration-200 bg-slate-50 focus:bg-white focus:shadow-md ${
      hasError
        ? "border-red-400 focus:border-red-500"
        : "border-slate-200 focus:border-blue-500"
    }`;

  const labelClass = "block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5";

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100">

      {/* ─── HEADER ─── */}
      <header className="fixed top-0 left-0 w-full z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/80 shadow-sm">
        <div className="max-w-7xl mx-auto flex justify-between items-center px-5 sm:px-8 py-4">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center shadow-md">
              <span className="text-white font-black text-sm tracking-tight">IA</span>
            </div>
            <span className="font-black text-slate-800 text-lg tracking-tight hidden sm:block">
              Intellekt<span className="text-blue-600">.</span>
            </span>
          </div>

          {/* Nav */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => scrollToSection(contactRef)}
              className="text-slate-600 hover:text-blue-700 px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-semibold hover:bg-blue-50 transition-all duration-200"
            >
              Contact
            </button>
            <button
              onClick={() => scrollToSection(enquiryRef)}
              className="text-slate-600 hover:text-blue-700 px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-semibold hover:bg-blue-50 transition-all duration-200"
            >
              Enquiry
            </button>
            <button
              onClick={() => router.push("/login")}
              className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 sm:px-6 py-2.5 rounded-full text-xs sm:text-sm font-bold shadow-md shadow-blue-200 hover:shadow-lg hover:shadow-blue-300 hover:from-blue-700 hover:to-blue-800 transition-all duration-200"
            >
              Login →
            </button>
          </div>
        </div>
      </header>

      {/* ─── HERO SECTION ─── */}
      <section className="relative w-full pt-28 sm:pt-32 pb-10 px-4 sm:px-6 md:px-10 lg:px-16">
        {/* Decorative blobs */}
        <div className="absolute top-20 left-10 w-64 h-64 bg-blue-200/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-40 right-10 w-80 h-80 bg-indigo-200/20 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto relative">

          {/* Brand bar */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 px-4 py-1.5 rounded-full mb-4">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-blue-700 text-xs font-bold uppercase tracking-widest">Now Enrolling 2025–26</span>
            </div>
            <h1 className="text-slate-900 text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-tight">
              Intellekt <span className="text-blue-600">Academy</span>
            </h1>
            <p className="mt-3 text-slate-500 text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed font-medium">
              Elevating academic excellence through innovative learning, personalized growth, and modern student management.
            </p>
          </div>

          {/* Carousel */}
          <div className="relative">
            <div className="overflow-hidden rounded-2xl sm:rounded-3xl shadow-2xl shadow-blue-100/50">
              <div
                className="flex transition-transform duration-700 ease-in-out"
                style={{ transform: `translateX(-${currentCard * 100}%)` }}
              >
                {cards.map((card, index) => (
                  <div
                    key={index}
                    className="w-full shrink-0 bg-gradient-to-br from-[#0b1f5f] via-[#0d2680] to-[#1a3fa0] rounded-2xl sm:rounded-3xl px-6 sm:px-8 md:px-12 py-8 sm:py-10 md:py-14"
                  >
                    <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-8 md:gap-10 items-center">
                      <div className="order-1 text-left">
                        <h2
                          className={`text-white font-black leading-[1.05] ${
                            index === 1 ? "text-3xl sm:text-4xl md:text-5xl" : "text-3xl sm:text-4xl md:text-6xl"
                          }`}
                        >
                          {card.title}
                        </h2>
                        <div className="mt-3 w-12 h-1 bg-blue-400 rounded-full" />
                        <p className="mt-5 text-blue-100 text-base sm:text-lg md:text-[18px] leading-relaxed max-w-2xl font-medium">
                          {card.description}
                        </p>
                      </div>
                      <div className="order-2">
                        <div className="relative w-full h-[220px] sm:h-[280px] md:h-[340px] lg:h-[360px] rounded-xl sm:rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.4)] ring-4 ring-white/10">
                          <Image src={card.image} alt={card.alt} fill className="object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#0b1f5f]/30 to-transparent" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Arrows */}
            <button
              onClick={goPrev}
              className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 z-20 bg-white/90 hover:bg-white shadow-xl rounded-full p-2.5 sm:p-3 transition-all duration-200 hover:scale-110"
              aria-label="Previous slide"
            >
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 text-[#0b1f5f]" />
            </button>
            <button
              onClick={goNext}
              className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-20 bg-white/90 hover:bg-white shadow-xl rounded-full p-2.5 sm:p-3 transition-all duration-200 hover:scale-110"
              aria-label="Next slide"
            >
              <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-[#0b1f5f]" />
            </button>

            {/* Dots */}
            <div className="flex justify-center gap-2 mt-5">
              {cards.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentCard(index)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    currentCard === index ? "w-8 bg-blue-600" : "w-2 bg-blue-200"
                  }`}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
            </div>
          </div>

          {/* Stats bar */}
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {stats.map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                className="bg-white border border-slate-100 rounded-2xl px-4 py-5 flex flex-col items-center text-center shadow-sm hover:shadow-md transition-shadow duration-200"
              >
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mb-2">
                  <Icon className="w-5 h-5 text-blue-600" />
                </div>
                <p className="text-xl sm:text-2xl font-black text-slate-800">{value}</p>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CONTACT + ENQUIRY ─── */}
      <section className="px-4 sm:px-6 md:px-10 lg:px-16 pb-16 md:pb-20">
        <div className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-2 gap-6 sm:gap-8">

          {/* Contact Card */}
          <div
            ref={contactRef}
            className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 p-7 sm:p-8 md:p-10 scroll-mt-28"
          >
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                <Phone className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Reach Out</p>
                <h2 className="text-xl sm:text-2xl font-black text-slate-800">Contact Us</h2>
              </div>
            </div>

            <div className="space-y-5">
              {[
                {
                  icon: Mail,
                  label: "Email Address",
                  content: "support@intellekt.com",
                  href: "mailto:support@intellekt.com",
                },
                {
                  icon: Phone,
                  label: "Phone Number",
                  content: "+91 98765 43210",
                  href: "tel:+919876543210",
                },
                {
                  icon: MapPin,
                  label: "Our Location",
                  content: "View on Google Maps",
                  href: "https://maps.app.goo.gl/B4JhSmtsjJsx9ixT9",
                },
              ].map(({ icon: Icon, label, content, href }) => (
                <a
                  key={label}
                  href={href}
                  target={href.startsWith("http") ? "_blank" : undefined}
                  rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 hover:bg-blue-50 border border-slate-100 hover:border-blue-200 transition-all duration-200 group"
                >
                  <div className="w-11 h-11 bg-white border border-slate-200 group-hover:border-blue-300 group-hover:bg-blue-600 rounded-xl flex items-center justify-center shadow-sm transition-all duration-200 shrink-0">
                    <Icon className="w-5 h-5 text-blue-600 group-hover:text-white transition-colors duration-200" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                    <p className="text-slate-700 text-sm sm:text-base font-semibold mt-0.5 group-hover:text-blue-700 transition-colors">{content}</p>
                  </div>
                </a>
              ))}
            </div>

            {/* Decorative bottom block */}
            <div className="mt-8 bg-gradient-to-br from-[#0b1f5f] to-[#1a3fa0] rounded-2xl p-5 text-white">
              <p className="font-black text-base sm:text-lg leading-snug">Ready to shape your academic future?</p>
              <p className="text-blue-200 text-sm mt-1.5 leading-relaxed">Fill out the enquiry form and our team will get back to you within 24 hours.</p>
              <button
                onClick={() => scrollToSection(enquiryRef)}
                className="mt-4 bg-white text-blue-700 text-sm font-bold px-5 py-2.5 rounded-full hover:bg-blue-50 transition-colors"
              >
                Fill Enquiry →
              </button>
            </div>
          </div>

          {/* Enquiry Form */}
          <div
            ref={enquiryRef}
            className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 p-7 sm:p-8 md:p-10 scroll-mt-28"
          >
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Get Started</p>
                <h2 className="text-xl sm:text-2xl font-black text-slate-800">Enquiry Form</h2>
              </div>
            </div>

            {submitSuccess && (
              <div className="mb-5 bg-green-50 border border-green-200 rounded-2xl px-5 py-4 flex items-center gap-3">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-green-800 font-semibold text-sm">Enquiry submitted successfully! We'll contact you soon.</p>
              </div>
            )}

            <form onSubmit={handleEnquirySubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Student Name */}
                <div className="sm:col-span-2">
                  <label className={labelClass}>Student Name</label>
                  <input type="text" name="studentName" value={formData.studentName}
                    onChange={handleChange} placeholder="Enter student name"
                    className={inputClass()} required maxLength={50} autoComplete="off" />
                </div>

                {/* Class */}
                <div>
                  <label className={labelClass}>Class</label>
                  <select name="className" value={formData.className} onChange={handleChange}
                    className={inputClass()} required>
                    <option value="">Select class</option>
                    <option value="10">10</option>
                    <option value="11">11</option>
                    <option value="12">12</option>
                  </select>
                </div>

                {/* Board */}
                <div>
                  <label className={labelClass}>Board</label>
                  <select name="board" value={formData.board} onChange={handleChange}
                    className={inputClass()} required>
                    <option value="">Select board</option>
                    <option value="CBSE">CBSE</option>
                    <option value="Stateboard">Stateboard</option>
                    <option value="Isc">ISC</option>
                  </select>
                </div>

                {/* School Name */}
                <div className="sm:col-span-2">
                  <label className={labelClass}>School Name</label>
                  <input type="text" name="schoolName" value={formData.schoolName}
                    onChange={handleChange} placeholder="Enter school name"
                    className={inputClass()} required maxLength={100} autoComplete="off" />
                </div>

                {/* Subjects */}
                <div>
                  <label className={labelClass}>Subjects</label>
                  <select name="subjects" value={formData.subjects} onChange={handleChange}
                    className={inputClass()} required>
                    <option value="">Select subject</option>
                    <option value="Physics">Physics</option>
                    <option value="Math">Math</option>
                    <option value="Both">Both</option>
                  </select>
                </div>

                {/* Mode of Education */}
                <div>
                  <label className={labelClass}>Mode of Education</label>
                  <select name="modeOfEducation" value={formData.modeOfEducation} onChange={handleChange}
                    className={inputClass()} required>
                    <option value="">Select mode</option>
                    <option value="Online">Online</option>
                    <option value="Offline">Offline</option>
                  </select>
                </div>

                {/* Parent Name */}
                <div className="sm:col-span-2">
                  <label className={labelClass}>Parent Name</label>
                  <input type="text" name="parentName" value={formData.parentName}
                    onChange={handleChange} placeholder="Enter parent name"
                    className={inputClass()} required maxLength={50} autoComplete="off" />
                </div>

                {/* Phone */}
                <div>
                  <label className={labelClass}>Phone Number</label>
                  <input type="tel" name="mobileNumber" value={formData.mobileNumber}
                    onChange={handleChange} placeholder="10-digit number"
                    className={inputClass(!!phoneError)} required inputMode="numeric"
                    maxLength={10} autoComplete="off" />
                  {phoneError && <p className="text-red-500 text-xs mt-1.5 font-medium">{phoneError}</p>}
                </div>

                {/* Area */}
                <div>
                  <label className={labelClass}>Area</label>
                  <input type="text" name="area" value={formData.area}
                    onChange={handleChange} placeholder="Enter area"
                    className={inputClass()} required maxLength={80} autoComplete="off" />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full py-3.5 rounded-xl font-bold text-sm tracking-wide transition-all duration-200 shadow-md mt-2 ${
                  isSubmitting
                    ? "bg-blue-400 text-white cursor-not-allowed"
                    : "bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 hover:shadow-lg shadow-blue-200"
                }`}
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Submitting...
                  </span>
                ) : (
                  "Submit Enquiry →"
                )}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="bg-[#0b1f5f] text-white px-4 sm:px-8 py-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center">
              <span className="text-white font-black text-xs">IA</span>
            </div>
            <span className="font-black text-base tracking-tight">Intellekt Academy</span>
          </div>
          <p className="text-blue-300 text-xs text-center sm:text-right font-medium">
            © {new Date().getFullYear()} Intellekt Academy. All rights reserved.
          </p>
        </div>
      </footer>

      {/* Scroll to top */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-50 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-full p-3.5 shadow-xl shadow-blue-300/40 transition-all duration-200 hover:scale-110"
          aria-label="Scroll to top"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}