// Validate before any automatic cancellation, reschedule, or approval.
export function assertDemoAppointmentsSafe(appointments, data) {
  for (const item of appointments.filter(item => item.status === 'confirmed')) {
    if (item.task_id !== data.taskId || (data.appointmentId && item.id !== data.appointmentId)) {
      throw new Error('Demo clean/reset stopped: an additional appointment exists. Review it manually in Calendar before retrying.');
    }
    if (!item.canManage) {
      throw new Error('Demo clean/reset stopped: you cannot manage this appointment. Sign in with its original calendar owner and review it in Calendar.');
    }
    let attendees;
    try { attendees = JSON.parse(item.attendees_json); } catch { /* Fail closed below. */ }
    if (!Array.isArray(attendees)) {
      throw new Error('Demo clean/reset stopped: the appointment guest list is unreadable. Review it in Calendar before retrying.');
    }
    if (attendees.length) {
      throw new Error('Demo clean/reset stopped: the appointment has guests (approving the recording proposal adds the demo guest). In Carestead Calendar, open Alex (calendar demo), choose Cancel appointment, review Guests receiving updates, and approve cancellation only if you intend to notify them. Then rerun: node scripts/seed-calendar-demo.mjs --clean. Do not use --reset to bypass guest review.');
    }
  }
}
