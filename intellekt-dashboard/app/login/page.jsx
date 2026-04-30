'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Login() {
	const router = useRouter();

	const [ roll, setRoll ] = useState('');
	const [ password, setPassword ] = useState('');

	const handleSubmit = async (e) => {
		e.preventDefault();

		const rollUpper = roll.toUpperCase().trim();

		try {
			const apiBase = process.env.NEXT_PUBLIC_API_URL || 'https://responsible-wonder-production.up.railway.app';
			const resp = await fetch(`${apiBase}/login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: rollUpper, password })
			});

			const data = await resp.json().catch(() => ({}));

			if (!resp.ok) {
				alert(data.error || 'Login failed');
				return;
			}

			if (data.role === 'student') {
				router.push(`/student?roll=${rollUpper}`);
			} else if (data.role === 'faculty') {
				router.push(`/faculty-dashboard/profile?id=${rollUpper}`);
			} else if (data.role === 'admin') {
				router.push(`/admin?roll=${rollUpper}`);
			} else {
				alert('Unknown role');
			}
		} catch (err) {
			console.error('Login error:', err);
			alert('Failed to reach authentication server');
		}
	};

	return (
		<div className="min-h-screen w-full bg-[#72c2bb] overflow-hidden relative">
			{/* Background Illustration */}
			<div
				className="absolute inset-0"
				style={{
					backgroundImage: "url('/LOG.png')",
					backgroundSize: 'cover',
					backgroundPosition: 'center',
					backgroundRepeat: 'no-repeat'
				}}
			/>

			{/* Soft overlay for better readability */}
			<div className="absolute inset-0 bg-[#72c2bb]/20" />

			{/* Content */}
			<div className="relative z-10 min-h-screen flex items-center justify-center px-4 sm:px-6 md:px-10 py-6">
				<div className="
            w-full max-w-[1320px]
            flex justify-center md:justify-end
            items-center
          ">
					<div className="
              w-full max-w-[560px]
              rounded-[28px] sm:rounded-[34px] md:rounded-[40px]
              bg-[#f3f3f3]
              px-6 sm:px-8 md:px-11
              py-8 sm:py-10 md:py-12
              shadow-[0_25px_60px_rgba(0,0,0,0.35)]
              border border-white/20
              backdrop-blur-[1px]
            ">
						<div className="w-full">
							<h1 className="
                  text-[#08245c]
                  font-extrabold
                  leading-[0.95]
                  text-[42px] sm:text-[56px] md:text-[72px]
                  tracking-[-0.03em]
                ">
								Intellekt
								<br />
								Academy
							</h1>

							<p className="mt-5 md:mt-6 text-[#08245c] font-semibold text-lg sm:text-xl">
								Welcomes You!
							</p>

							<form onSubmit={handleSubmit} className="mt-10 sm:mt-12 space-y-6">
								<div>
									<label className="block text-[#08245c] text-sm font-semibold mb-3">
										Enter the ID *
									</label>
									<input
										type="text"
										value={roll}
										onChange={(e) => setRoll(e.target.value)}
										placeholder=""
										className="
                      w-full h-[48px] sm:h-[52px]
                      rounded-xl
                      border border-[#d7dde8]
                      bg-white
                      px-4
                      text-[#08245c]
                      outline-none
                      focus:ring-2 focus:ring-blue-500
                      focus:border-blue-500
                    "
										required
									/>
								</div>

								<div>
									<label className="block text-[#08245c] text-sm font-semibold mb-3">Password*</label>
									<input
										type="password"
										value={password}
										onChange={(e) => setPassword(e.target.value)}
										placeholder=""
										className="
                      w-full h-[48px] sm:h-[52px]
                      rounded-xl
                      border border-[#d7dde8]
                      bg-white
                      px-4
                      text-[#08245c]
                      outline-none
                      focus:ring-2 focus:ring-blue-500
                      focus:border-blue-500
                    "
										required
									/>
								</div>

								<button
									type="submit"
									className="
                    w-full h-[46px] sm:h-[50px]
                    rounded-[10px]
                    bg-[#0d5bd4]
                    text-white
                    font-semibold
                    text-sm sm:text-base
                    transition
                    hover:bg-[#0a4fbb]
                    active:scale-[0.99]
                    shadow-md
                  "
								>
									Login
								</button>
							</form>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
