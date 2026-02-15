/**
 * Debug Panel Component
 * Displays debugging information in the bottom left corner
 */

import React, { useState, useEffect } from "react";
import { getErrors, clearErrors } from "../services/errorTracker";

export default function DebugPanel({
	viewState,
	selectedParcel,
	userLocation,
	isLoading,
	localParcels,
	visibleParcels,
	loadingParcels,
	onClose,
}) {
	const [fps, setFps] = useState(60);
	const [frameCount, setFrameCount] = useState(0);
	const [lastTime, setLastTime] = useState(Date.now());
	const [errors, setErrors] = useState([]);
	const [expandedErrors, setExpandedErrors] = useState(false);

	// Simple FPS counter
	useEffect(() => {
		let animationFrameId;

		const countFrame = () => {
			setFrameCount((prev) => prev + 1);
			const now = Date.now();

			if (now - lastTime >= 1000) {
				setFps(frameCount);
				setFrameCount(0);
				setLastTime(now);
			}

			animationFrameId = requestAnimationFrame(countFrame);
		};

		animationFrameId = requestAnimationFrame(countFrame);

		return () => cancelAnimationFrame(animationFrameId);
	}, [frameCount, lastTime]);

	// Poll for errors
	useEffect(() => {
		const interval = setInterval(() => {
			setErrors(getErrors());
		}, 500);

		return () => clearInterval(interval);
	}, []);

	return (
		<div
			className="fixed bottom-4 left-4 bg-black/80 backdrop-blur-sm border border-neon-green rounded-lg p-3 text-xs font-mono z-40 max-w-xs"
			onTouchStart={(e) => e.stopPropagation()}
			style={{ touchAction: "none" }}>
			<div className="flex items-center justify-between mb-2">
				<div className="text-neon-green font-bold">DEBUG INFO</div>
				{onClose && (
					<button
						onClick={onClose}
						onTouchStart={(e) => e.stopPropagation()}
						className="text-gray-400 hover:text-neon-green transition-colors"
						style={{ touchAction: "none" }}>
						✕
					</button>
				)}
			</div>
			{/* FPS */}
			<div className="text-gray-300 mb-2">
				<div>
					FPS: <span className="text-neon-green">{fps}</span>
				</div>
			</div>

			{/* View State */}
			<div className="text-gray-300 mb-2 border-t border-gray-600 pt-2">
				<div className="text-gray-400">View State:</div>
				<div>
					Zoom: <span className="text-neon-green text-lg font-bold">{viewState.zoom.toFixed(2)}</span>
					<span className={viewState.zoom >= 13 ? "text-green-400 ml-2" : "text-yellow-400 ml-2"}>
						{viewState.zoom >= 13 ? "✅ PARCELS ACTIVE" : "🔍 ZOOM IN 13+"}
					</span>
				</div>
				<div>
					Lat: <span className="text-neon-green">{viewState.latitude.toFixed(4)}</span>
				</div>
				<div>
					Lng: <span className="text-neon-green">{viewState.longitude.toFixed(4)}</span>
				</div>
			</div>

			{/* Parcel Data */}
			<div className="text-gray-300 mb-2 border-t border-gray-600 pt-2">
				<div className="text-gray-400">Parcel Data:</div>
				<div>Loading: {loadingParcels ? "🔄" : "✅"}</div>
				<div>Local: {localParcels?.features?.length ?? 0} features</div>
				<div>Visible: {visibleParcels?.features?.length ?? 0} features</div>
				<div>Render: {visibleParcels?.features?.length > 0 ? "🎨 YES" : "❌ NO"}</div>
			</div>

			{/* Selected Parcel */}
			<div className="text-gray-300 mb-2 border-t border-gray-600 pt-2">
				<div>Map Interaction:</div>
				<div>
					Selected:{" "}
					<span className={selectedParcel ? "text-green-400" : "text-gray-500"}>
						{selectedParcel ? "YES" : "NONE"}
					</span>
				</div>
			</div>

			{/* User Location */}
			<div className="text-gray-300 border-t border-gray-600 pt-2">
				<div>User Location:</div>
				<div className={userLocation ? "text-green-400" : "text-gray-500"}>
					{userLocation ? "ACQUIRED" : "PENDING"}
				</div>
			</div>

			{/* HTTP Errors */}
			<div className="text-gray-300 border-t border-gray-600 pt-2 mt-2">
				<button
					onClick={() => setExpandedErrors(!expandedErrors)}
					className="w-full text-left hover:text-neon-green transition">
					<div>
						Errors: <span className={errors.length > 0 ? "text-red-400" : "text-green-400"}>{errors.length}</span>
					</div>
				</button>

				{expandedErrors && errors.length > 0 && (
					<div className="mt-2 max-h-32 overflow-y-auto bg-black/50 rounded p-2 border border-red-500/30">
						{errors.slice(0, 5).map((err, idx) => (
							<div key={idx} className="mb-1 text-red-300 text-xs">
								<div className="font-bold">{err.message}</div>
								{err.context?.url && <div className="text-gray-400 truncate">URL: {err.context.url}</div>}
								{err.context?.duration && <div className="text-gray-400">{err.context.duration}</div>}
							</div>
						))}
					</div>
				)}
			</div>

			{/* Clear Errors Button */}
			{errors.length > 0 && (
				<button
					onClick={() => {
						clearErrors();
						setErrors([]);
					}}
					onTouchStart={(e) => e.stopPropagation()}
					style={{ touchAction: "none" }}
					className="w-full mt-2 text-xs py-1 px-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded border border-red-500/30 transition">
					Clear Errors
				</button>
			)}
		</div>
	);
}
