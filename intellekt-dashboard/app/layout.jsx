import './globals.css';

export const metadata = {
	title: 'Intellekt Dashboard',
	description: 'Intellekt Academy Portal',
	icons: {
		icon: '/logo.png' // 👈 your file in public folder
	}
};

export default function RootLayout({ children }) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
