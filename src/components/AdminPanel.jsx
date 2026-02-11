/**
 * Admin Panel Component
 * Displays all logged queries and geolocations
 */

import React, { useState, useEffect } from "react";
import { collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "../config/firebase";

export default function AdminPanel({ onLocationClick }) {
	const [adminOpen, setAdminOpen] = useState(false);
	const [password, setPassword] = useState("");
	const [authenticated, setAuthenticated] = useState(false);
	const [queries, setQueries] = useState([]);
	const [geolocations, setGeolocations] = useState([]);
	const [loading, setLoading] = useState(false);
	const [tab, setTab] = useState("queries");

	// Simple password check (in production, use proper authentication)
	const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || "admin123";

	const handleLogin = (e) => {
		e.preventDefault();
		if (password === ADMIN_PASSWORD) {
			setAuthenticated(true);
			setPassword("");
			loadData();
		} else {
			alert("Invalid password");
		}
	};

	const loadData = async () => {
		setLoading(true);
		try {
			// Load queries
			const queriesRef = collection(db, "queries");
			const queriesQ = query(queriesRef, orderBy("timestamp", "desc"), limit(100));
			const queriesSnap = await getDocs(queriesQ);
			const queriesList = queriesSnap.docs.map((doc) => ({
				id: doc.id,
				...doc.data(),
				timestamp: doc.data().timestamp?.toDate?.() || new Date(),
			}));
			setQueries(queriesList);

			// Load geolocations
			const geoRef = collection(db, "geolocations");
			const geoQ = query(geoRef, orderBy("timestamp", "desc"), limit(100));
			const geoSnap = await getDocs(geoQ);
			const geoList = geoSnap.docs.map((doc) => ({
				id: doc.id,
				...doc.data(),
				timestamp: doc.data().timestamp?.toDate?.() || new Date(),
			}));
			setGeolocations(geoList);
		} catch (error) {
			console.error("Error loading admin data:", error);
			alert("Error loading data: " + error.message);
		} finally {
			setLoading(false);
		}
	};

	if (!adminOpen) {
		return (
			<button
				onClick={() => setAdminOpen(true)}
				className="fixed bottom-4 right-4 bg-gray-800 hover:bg-gray-700 text-white px-3 py-2 rounded text-xs font-mono z-50 transition">
				Admin
			</button>
		);
	}

	return (
		<div className="fixed bottom-4 right-4 w-96 max-h-96 bg-gray-900 border border-neon-green rounded-lg shadow-2xl z-50 flex flex-col overflow-hidden">
			{/* Header */}
			<div className="bg-gradient-to-r from-gray-800 to-gray-900 border-b border-neon-green px-4 py-3 flex justify-between items-center">
				<h3 className="text-neon-green font-bold">Admin Panel</h3>
				<button
					onClick={() => {
						setAdminOpen(false);
						setAuthenticated(false);
					}}
					className="text-gray-400 hover:text-white text-xl">
					×
				</button>
			</div>

			{/* Content - with explicit background */}
			<div className="flex-1 overflow-y-auto bg-gray-900 p-4 flex flex-col">
				{!authenticated ? (
					<form onSubmit={handleLogin} className="space-y-3">
						<p className="text-gray-300 text-sm">Enter admin password:</p>
						<input
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="Password"
							className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-neon-green"
						/>
						<button
							type="submit"
							className="w-full bg-neon-green text-black font-bold py-2 rounded hover:bg-green-400 transition">
							Login
						</button>
					</form>
				) : (
					<>
						{/* Tabs */}
						<div className="flex gap-2 border-b border-gray-700 mb-4">
							<button
								onClick={() => setTab("queries")}
								className={`px-3 py-2 text-sm font-semibold transition ${
									tab === "queries"
										? "text-neon-green border-b-2 border-neon-green"
										: "text-gray-400 hover:text-gray-200"
								}`}>
								Queries ({queries.length})
							</button>
							<button
								onClick={() => setTab("geolocations")}
								className={`px-3 py-2 text-sm font-semibold transition ${
									tab === "geolocations"
										? "text-neon-green border-b-2 border-neon-green"
										: "text-gray-400 hover:text-gray-200"
								}`}>
								Geolocations ({geolocations.length})
							</button>
							<button
								onClick={loadData}
								disabled={loading}
								className="px-3 py-2 text-sm text-gray-400 hover:text-gray-200 disabled:opacity-50">
								{loading ? "..." : "Refresh"}
							</button>
						</div>

						{/* Query List */}
						{tab === "queries" && (
							<div className="space-y-2 max-h-64 overflow-y-auto mb-4">
								{queries.length === 0 ? (
									<p className="text-gray-500 text-xs">No queries yet</p>
								) : (
									queries.map((q) => (
										<div
											key={q.id}
											onClick={() => onLocationClick && onLocationClick(q.lat, q.lng, 18)}
											className="bg-gray-800 border border-gray-700 rounded p-2 text-xs space-y-1 cursor-pointer hover:bg-gray-700 hover:border-neon-green transition">
											<div className="flex justify-between">
												<span className="text-neon-green font-mono">{q.result?.owner || "Unknown"}</span>
												<span className="text-gray-500">{q.timestamp?.toLocaleTimeString() || ""}</span>
											</div>
											<div className="text-gray-400">
												{q.address ? `📍 ${q.address}` : `🗺️ ${q.lng?.toFixed(4)}, ${q.lat?.toFixed(4)}`}
											</div>
											<div className="text-gray-500">
												📊 {q.result?.acres?.toFixed(2) || "N/A"} acres | {q.source}
											</div>
										</div>
									))
								)}
							</div>
						)}

						{/* Geolocation List */}
						{tab === "geolocations" && (
							<div className="space-y-2 max-h-64 overflow-y-auto mb-4">
								{geolocations.length === 0 ? (
									<p className="text-gray-500 text-xs">No geolocation data yet</p>
								) : (
									geolocations.map((g) => (
										<div
											key={g.id}
											onClick={() => onLocationClick && onLocationClick(g.latitude, g.longitude, 18)}
											className="bg-gray-800 border border-gray-700 rounded p-2 text-xs space-y-1 cursor-pointer hover:bg-gray-700 hover:border-neon-green transition">
											<div className="flex justify-between">
												<span className="text-neon-green font-mono">
													{g.latitude?.toFixed(4)}, {g.longitude?.toFixed(4)}
												</span>
												<span className="text-gray-500">{g.timestamp?.toLocaleTimeString() || ""}</span>
											</div>
											<div className="text-gray-500">Accuracy: ±{g.accuracy?.toFixed(0) || "N/A"} m</div>
										</div>
									))
								)}
							</div>
						)}

						{/* Logout */}
						<button
							onClick={() => setAuthenticated(false)}
							className="w-full text-xs text-gray-400 hover:text-gray-200 py-2 border-t border-gray-700 transition">
							Logout
						</button>
					</>
				)}
			</div>
		</div>
	);
}
