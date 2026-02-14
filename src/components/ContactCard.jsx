import React, { useState, useEffect } from "react";
import VerifiedBadge from "./VerifiedBadge";
import { fetchOwnerData } from "../services/enformionService";

/**
 * ContactCard - Slide-up modal displaying landowner contact information
 * Features glassmorphism effect with direct contact display
 */
const ContactCard = ({ ownerName, parcelId, acres, onClose }) => {
	const [contactData, setContactData] = useState(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState(null);

	// Automatically fetch contact data on mount
	useEffect(() => {
		const fetchData = async () => {
			setIsLoading(true);
			setError(null);

			try {
				const data = await fetchOwnerData(ownerName, parcelId);
				setContactData(data);
			} catch (err) {
				setError("Unable to retrieve contact information. Please try again.");
				console.error("Error fetching owner data:", err);
			} finally {
				setIsLoading(false);
			}
		};

		fetchData();
	}, [ownerName, parcelId]);

	return (
		<>
			{/* Backdrop */}
			<div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity" onClick={onClose} />

			{/* Modal Card - Glassmorphism */}
			<div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
				<div className="bg-white/10 backdrop-blur-xl border-t border-white/20 rounded-t-3xl shadow-2xl p-6 max-w-2xl mx-auto">
					{/* Header */}
					<div className="flex justify-between items-start mb-6">
						<div>
							<h2 className="text-2xl font-bold text-white mb-1">Land Owner Information</h2>
							<p className="text-gray-300 text-sm">Parcel ID: {parcelId || "N/A"}</p>
						</div>
						<button onClick={onClose} className="text-white/70 hover:text-white text-2xl font-light leading-none">
							×
						</button>
					</div>

					{/* Owner Name */}
					<div className="mb-6">
						<label className="text-gray-400 text-sm uppercase tracking-wide block mb-2">Owner Name</label>
						<p className="text-white text-xl font-semibold">{ownerName}</p>
					</div>

					{/* Parcel Size */}
					{acres && (
						<div className="mb-6">
							<label className="text-gray-400 text-sm uppercase tracking-wide block mb-2">Parcel Size</label>
							<p className="text-white text-lg">{parseFloat(acres).toFixed(2)} acres</p>
						</div>
					)}

					{/* Contact Information Section */}
					{isLoading ? (
						<div className="space-y-4 mb-6">
							<div className="flex items-center justify-center py-8">
								<svg className="animate-spin h-8 w-8 text-neon-green" viewBox="0 0 24 24">
									<circle
										className="opacity-25"
										cx="12"
										cy="12"
										r="10"
										stroke="currentColor"
										strokeWidth="4"
										fill="none"
									/>
									<path
										className="opacity-75"
										fill="currentColor"
										d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
									/>
								</svg>
								<span className="ml-3 text-white">Loading contact information...</span>
							</div>
						</div>
					) : error ? (
						<div className="mb-6">
							<div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4">
								<p className="text-red-200">{error}</p>
							</div>
						</div>
					) : (
						<div className="space-y-4 mb-6">
							<div>
								<label className="text-gray-400 text-sm uppercase tracking-wide block mb-2">Phone Number</label>
								<div className="bg-white/5 backdrop-blur-sm rounded-lg p-4 flex items-center justify-between">
									<p className="text-white text-lg">{contactData?.phone || "Not available"}</p>
									{contactData?.phone && <VerifiedBadge />}
								</div>
							</div>

							<div>
								<label className="text-gray-400 text-sm uppercase tracking-wide block mb-2">Email Address</label>
								<div className="bg-white/5 backdrop-blur-sm rounded-lg p-4 flex items-center justify-between">
									<p className="text-white text-lg">{contactData?.email || "Not available"}</p>
									{contactData?.email && <VerifiedBadge />}
								</div>
							</div>

							{contactData?.address && (
								<div>
									<label className="text-gray-400 text-sm uppercase tracking-wide block mb-2">Mailing Address</label>
									<div className="bg-white/5 backdrop-blur-sm rounded-lg p-4">
										<p className="text-white">{contactData.address}</p>
									</div>
								</div>
							)}

							{contactData && (
								<div className="bg-neon-green/10 border border-neon-green/30 rounded-lg p-3">
									<p className="text-neon-green text-sm">✓ Contact information verified</p>
								</div>
							)}
						</div>
					)}
				</div>
			</div>
		</>
	);
};

export default ContactCard;
