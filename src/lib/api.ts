import { supabase } from './supabase';
import type {
  User, TechnicianProfile, KycVerification, Job, Bid, Payment,
  Review, ChatRoom, Message, Notification, Shop, Subscription,
  JobWithDetails, ChatRoomWithDetails, TechWithProfile,
} from './types';
import { generateId } from './utils';

// ============ PASSWORD HASHING ============

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ============ AUTH ============

export async function login(phone: string, password: string): Promise<User | null> {
  const passwordHash = await hashPassword(password);
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('phone', phone)
    .eq('password_hash', passwordHash)
    .maybeSingle();

  if (error || !data) return null;
  return data as User;
}

export async function register(data: {
  phone: string;
  password: string;
  first_name: string;
  last_name: string;
  email?: string;
  role: string;
  trade?: string;
  years_experience?: number;
  hourly_rate?: number;
  store_name?: string;
  store_category?: string;
  store_city?: string;
}): Promise<User | null> {
  const userId = generateId('u-');
  const passwordHash = await hashPassword(data.password);
  const insertData: any = {
    id: userId,
    phone: data.phone,
    password_hash: passwordHash,
    first_name: data.first_name,
    last_name: data.last_name,
    email: data.email || null,
    role: data.role,
    is_phone_verified: false,
    is_active: true,
  };

  const { data: user, error } = await supabase
    .from('users')
    .insert(insertData)
    .select()
    .single();

  if (error || !user) return null;

  if (data.role === 'technician') {
    await supabase.from('technician_profiles').insert({
      id: generateId('tp-'),
      user_id: userId,
      trade: data.trade || 'Electrician',
      hourly_rate: data.hourly_rate || 3000,
      years_experience: data.years_experience || 1,
      city: 'Lagos',
      lat: 6.5 + Math.random() * 0.1,
      lng: 3.3 + Math.random() * 0.1,
      tier: 'standard',
      rating: 0,
      total_reviews: 0,
      total_jobs: 0,
      completion_rate: 100,
      response_time_minutes: 30,
      is_available: true,
      is_premium: false,
    });
    await supabase.from('kyc_verifications').insert({
      id: generateId('kyc-'),
      user_id: userId,
      status: 'not_submitted',
    });
    await supabase.from('subscriptions').insert({
      id: generateId('sub-'),
      user_id: userId,
      plan: 'basic',
      price: 0,
      is_active: true,
    });
  }

  if (data.role === 'store_owner') {
    await supabase.from('shops').insert({
      id: generateId('shop-'),
      owner_id: userId,
      name: data.store_name || 'My Shop',
      category: data.store_category || 'Electrical',
      city: data.store_city || 'Lagos',
      is_verified: false,
      is_active: true,
      rating: 0,
      total_quotes: 0,
      delivery_available: false,
    });
  }

  return user as User;
}

// ============ TECHNICIANS ============

export async function getTechnicians(filters?: {
  trade?: string;
  city?: string;
  tier?: string;
  availableOnly?: boolean;
  minRating?: number;
  maxRate?: number;
}): Promise<TechWithProfile[]> {
  let query = supabase
    .from('users')
    .select(`
      *,
      profile:technician_profiles(*),
      kyc:kyc_verifications(*)
    `)
    .eq('role', 'technician')
    .eq('is_active', true);

  const { data: users, error } = await query;

  if (error || !users) return [];

  let result = users as any[];

  if (filters?.trade && filters.trade !== 'All') {
    result = result.filter((u) => u.profile?.trade === filters.trade);
  }
  if (filters?.city) {
    result = result.filter((u) => u.profile?.city === filters.city);
  }
  if (filters?.tier && filters.tier !== 'All') {
    result = result.filter((u) => u.profile?.tier === filters.tier);
  }
  if (filters?.availableOnly) {
    result = result.filter((u) => u.profile?.is_available);
  }
  if (filters?.minRating) {
    result = result.filter((u) => (u.profile?.rating || 0) >= filters.minRating!);
  }
  if (filters?.maxRate && filters.maxRate > 0) {
    result = result.filter((u) => (u.profile?.hourly_rate || 0) <= filters.maxRate!);
  }

  return result as TechWithProfile[];
}

export async function getTechnicianById(id: string): Promise<TechWithProfile | null> {
  const { data, error } = await supabase
    .from('users')
    .select(`
      *,
      profile:technician_profiles(*),
      kyc:kyc_verifications(*)
    `)
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return data as TechWithProfile;
}

export async function getTechnicianReviews(techId: string): Promise<Review[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('technician_id', techId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as Review[];
}

export async function updateTechnicianProfile(userId: string, updates: Partial<TechnicianProfile>, requesterId: string): Promise<boolean> {
  if (userId !== requesterId) return false;
  const { error } = await supabase
    .from('technician_profiles')
    .update(updates)
    .eq('user_id', userId);
  return !error;
}

// ============ JOBS ============

export async function getJobs(filters?: {
  trade?: string;
  status?: string;
  search?: string;
  urgentOnly?: boolean;
  clientId?: string;
  technicianId?: string;
}): Promise<Job[]> {
  let query = supabase.from('jobs').select('*').order('created_at', { ascending: false });

  if (filters?.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }
  if (filters?.clientId) {
    query = query.eq('client_id', filters.clientId);
  }
  if (filters?.technicianId) {
    query = query.eq('technician_id', filters.technicianId);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  let result = data as Job[];

  if (filters?.trade && filters.trade !== 'All' && filters.trade !== 'all') {
    result = result.filter((j) => j.trade === filters.trade);
  }
  if (filters?.search) {
    const search = filters.search.toLowerCase();
    result = result.filter(
      (j) =>
        j.title.toLowerCase().includes(search) ||
        (j.location_text || '').toLowerCase().includes(search)
    );
  }
  if (filters?.urgentOnly) {
    result = result.filter((j) => j.is_urgent);
  }

  return result;
}

export async function getJobById(id: string): Promise<JobWithDetails | null> {
  const { data: job, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !job) return null;

  const jobData = job as Job;

  const [client, technician, bids, payment, review] = await Promise.all([
    jobData.client_id ? getUserById(jobData.client_id) : null,
    jobData.technician_id ? getUserById(jobData.technician_id) : null,
    getBidsForJob(id),
    getPaymentForJob(id),
    getReviewForJob(id),
  ]);

  let techProfile: TechnicianProfile | null = null;
  if (technician) {
    techProfile = await getTechnicianProfile(technician.id);
  }

  return {
    ...jobData,
    client: client,
    technician: technician,
    technician_profile: techProfile,
    bids,
    payment,
    review,
  };
}

export async function createJob(data: {
  client_id: string;
  title: string;
  trade: string;
  description: string;
  location_text: string;
  lat?: number;
  lng?: number;
  budget_min: number;
  is_urgent: boolean;
  scheduled_date?: string;
  photos?: string;
}): Promise<Job | null> {
  const { data: job, error } = await supabase
    .from('jobs')
    .insert({
      id: generateId('job-'),
      ...data,
      status: 'open',
    })
    .select()
    .single();

  if (error || !job) return null;
  return job as Job;
}

export async function updateJob(id: string, updates: Partial<Job>, requesterId: string): Promise<boolean> {
  const { data: job } = await supabase.from('jobs').select('client_id, technician_id').eq('id', id).single();
  if (!job) return false;
  const isClient = job.client_id === requesterId;
  const isTech = job.technician_id === requesterId;
  if (!isClient && !isTech) return false;
  const { error } = await supabase.from('jobs').update(updates).eq('id', id);
  return !error;
}

// ============ BIDS ============

export async function getBidsForJob(jobId: string): Promise<Bid[]> {
  const { data, error } = await supabase
    .from('bids')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as Bid[];
}

export async function createBid(data: {
  job_id: string;
  technician_id: string;
  amount: number;
  estimated_hours?: number;
  message: string;
}): Promise<Bid | null> {
  const { data: bid, error } = await supabase
    .from('bids')
    .insert({
      id: generateId('bid-'),
      ...data,
      status: 'pending',
    })
    .select()
    .single();

  if (error || !bid) return null;

  // Update job status to bidding if it was open
  await supabase
    .from('jobs')
    .update({ status: 'bidding' })
    .eq('id', data.job_id)
    .eq('status', 'open');

  return bid as Bid;
}

export async function updateBid(id: string, updates: Partial<Bid>): Promise<void> {
  await supabase.from('bids').update(updates).eq('id', id);
}

export async function acceptBid(bidId: string, jobId: string, techId: string, amount: number): Promise<void> {
  // Update the accepted bid
  await supabase.from('bids').update({ status: 'accepted' }).eq('id', bidId);

  // Reject all other bids
  await supabase
    .from('bids')
    .update({ status: 'rejected' })
    .eq('job_id', jobId)
    .neq('id', bidId);

  // Update the job
  await supabase
    .from('jobs')
    .update({
      technician_id: techId,
      agreed_amount: amount,
      status: 'in_progress',
      started_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  // Create chat room
  const { data: job } = await supabase.from('jobs').select('client_id').eq('id', jobId).single();
  if (job) {
    await supabase.from('chat_rooms').insert({
      id: generateId('room-'),
      job_id: jobId,
      client_id: job.client_id,
      tech_id: techId,
      last_message_at: new Date().toISOString(),
    });

    // Add system message
    await supabase.from('messages').insert({
      id: generateId('msg-'),
      room_id: (await supabase.from('chat_rooms').select('id').eq('job_id', jobId).single()).data?.id,
      sender_id: techId,
      content: 'Bid accepted. Job is now in progress.',
      type: 'system',
    });
  }
}

// ============ PAYMENTS ============

export async function getPaymentForJob(jobId: string): Promise<Payment | null> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('job_id', jobId)
    .maybeSingle();

  if (error || !data) return null;
  return data as Payment;
}

export async function createPayment(data: {
  job_id: string;
  client_id: string;
  technician_id: string;
  amount: number;
  platform_fee: number;
  technician_payout: number;
  reference: string;
  payment_method: string;
}): Promise<Payment | null> {
  const { data: payment, error } = await supabase
    .from('payments')
    .insert({
      id: generateId('pay-'),
      ...data,
      paystack_ref: 'psk_' + Date.now(),
      status: 'held',
      held_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !payment) return null;
  return payment as Payment;
}

export async function releasePayment(jobId: string, requesterId: string): Promise<{ success: boolean; error?: string }> {
  const { data: job } = await supabase.from('jobs').select('client_id, technician_id, status').eq('id', jobId).single();
  if (!job) return { success: false, error: 'Job not found' };
  if (job.client_id !== requesterId) return { success: false, error: 'Unauthorized' };
  if (job.status !== 'tech_confirmed') return { success: false, error: 'Job not ready for payment release' };

  const { error: paymentError } = await supabase
    .from('payments')
    .update({ status: 'released', released_at: new Date().toISOString() })
    .eq('job_id', jobId);
  if (paymentError) return { success: false, error: 'Failed to release payment' };

  await supabase
    .from('jobs')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', jobId);

  return { success: true };
}

// ============ REVIEWS ============

export async function getReviewForJob(jobId: string): Promise<Review | null> {
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('job_id', jobId)
    .maybeSingle();

  if (error || !data) return null;
  return data as Review;
}

export async function createReview(data: {
  job_id: string;
  reviewer_id: string;
  technician_id: string;
  rating: number;
  comment: string;
}): Promise<Review | null> {
  const { data: review, error } = await supabase
    .from('reviews')
    .insert({
      id: generateId('rev-'),
      ...data,
      is_verified: true,
    })
    .select()
    .single();

  if (error || !review) return null;

  // Update technician profile rating
  const reviews = await getTechnicianReviews(data.technician_id);
  const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
  const avgRating = reviews.length > 0 ? totalRating / reviews.length : 0;

  await supabase
    .from('technician_profiles')
    .update({
      rating: Math.round(avgRating * 10) / 10,
      total_reviews: reviews.length,
      total_jobs: reviews.length,
    })
    .eq('user_id', data.technician_id);

  return review as Review;
}

// ============ CHAT ============

export async function getChatRoomsForUser(userId: string): Promise<ChatRoomWithDetails[]> {
  const { data: rooms, error } = await supabase
    .from('chat_rooms')
    .select('*')
    .or(`client_id.eq.${userId},tech_id.eq.${userId}`)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (error || !rooms) return [];

  const result: ChatRoomWithDetails[] = [];

  for (const room of rooms as ChatRoom[]) {
    const [job, client, tech, lastMsg] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', room.job_id).maybeSingle(),
      supabase.from('users').select('*').eq('id', room.client_id).maybeSingle(),
      supabase.from('users').select('*').eq('id', room.tech_id).maybeSingle(),
      supabase
        .from('messages')
        .select('*')
        .eq('room_id', room.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const { count: unreadCount } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', room.id)
      .neq('sender_id', userId)
      .eq('is_read', false);

    let techProfile: TechnicianProfile | null = null;
    if (tech.data) {
      const { data: profile } = await supabase
        .from('technician_profiles')
        .select('*')
        .eq('user_id', tech.data.id)
        .maybeSingle();
      techProfile = profile as TechnicianProfile | null;
    }

    result.push({
      ...room,
      job: job.data as Job | null,
      client: client.data as User | null,
      tech: tech.data as User | null,
      tech_profile: techProfile,
      last_message: lastMsg.data as Message | null,
      unread_count: unreadCount || 0,
    });
  }

  return result;
}

export async function getChatRoomForJob(jobId: string): Promise<ChatRoomWithDetails | null> {
  const { data: room, error } = await supabase
    .from('chat_rooms')
    .select('*')
    .eq('job_id', jobId)
    .maybeSingle();

  if (error || !room) return null;

  const roomData = room as ChatRoom;
  const [job, client, tech] = await Promise.all([
    supabase.from('jobs').select('*').eq('id', roomData.job_id).maybeSingle(),
    supabase.from('users').select('*').eq('id', roomData.client_id).maybeSingle(),
    supabase.from('users').select('*').eq('id', roomData.tech_id).maybeSingle(),
  ]);

  let techProfile: TechnicianProfile | null = null;
  if (tech.data) {
    const { data: profile } = await supabase
      .from('technician_profiles')
      .select('*')
      .eq('user_id', tech.data.id)
      .maybeSingle();
    techProfile = profile as TechnicianProfile | null;
  }

  return {
    ...roomData,
    job: job.data as Job | null,
    client: client.data as User | null,
    tech: tech.data as User | null,
    tech_profile: techProfile,
    last_message: null,
    unread_count: 0,
  };
}

export async function getMessages(roomId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return data as Message[];
}

export async function sendMessage(data: {
  room_id: string;
  sender_id: string;
  content: string;
  type?: string;
  metadata?: string;
  reply_to_id?: string;
}): Promise<Message | null> {
  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      id: generateId('msg-'),
      ...data,
      type: data.type || 'text',
      is_read: false,
    })
    .select()
    .single();

  if (error || !message) return null;

  // Update room last_message_at
  await supabase
    .from('chat_rooms')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', data.room_id);

  return message as Message;
}

export async function markMessagesRead(roomId: string, userId: string): Promise<void> {
  await supabase
    .from('messages')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('room_id', roomId)
    .neq('sender_id', userId)
    .eq('is_read', false);
}

// ============ NOTIFICATIONS ============

export async function getNotifications(userId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as Notification[];
}

export async function markNotificationRead(id: string): Promise<void> {
  await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', id);
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_read', false);
}

export async function createNotification(data: {
  user_id: string;
  title: string;
  body: string;
  type?: string;
  reference_id?: string;
  reference_type?: string;
}): Promise<void> {
  await supabase.from('notifications').insert({
    id: generateId('not-'),
    ...data,
    is_read: false,
  });
}

// ============ SHOPS ============

export async function getShops(filters?: {
  category?: string;
  city?: string;
  deliveryOnly?: boolean;
  verifiedOnly?: boolean;
}): Promise<Shop[]> {
  let query = supabase.from('shops').select('*').eq('is_active', true);

  const { data, error } = await query;
  if (error || !data) return [];

  let result = data as Shop[];

  if (filters?.category && filters.category !== 'All') {
    result = result.filter((s) => s.category === filters.category);
  }
  if (filters?.city && filters.city !== 'All') {
    result = result.filter((s) => s.city === filters.city);
  }
  if (filters?.deliveryOnly) {
    result = result.filter((s) => s.delivery_available);
  }
  if (filters?.verifiedOnly) {
    result = result.filter((s) => s.is_verified);
  }

  return result;
}

export async function getShopById(id: string): Promise<Shop | null> {
  const { data, error } = await supabase
    .from('shops')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;
  return data as Shop;
}

// ============ KYC ============

export async function getKycStatus(userId: string): Promise<KycVerification | null> {
  const { data, error } = await supabase
    .from('kyc_verifications')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as KycVerification;
}

export async function submitKyc(data: {
  user_id: string;
  id_type: string;
  nin_hash: string;
  id_document_url?: string;
  selfie_url?: string;
}): Promise<void> {
  const existing = await getKycStatus(data.user_id);

  if (existing) {
    await supabase
      .from('kyc_verifications')
      .update({
        status: 'pending',
        id_type: data.id_type,
        nin_hash: data.nin_hash,
        id_document_url: data.id_document_url || null,
        selfie_url: data.selfie_url || null,
        submitted_at: new Date().toISOString(),
        reviewed_at: null,
        reviewed_by: null,
        rejection_reason: null,
      })
      .eq('user_id', data.user_id);
  } else {
    await supabase.from('kyc_verifications').insert({
      id: generateId('kyc-'),
      ...data,
      status: 'pending',
      submitted_at: new Date().toISOString(),
    });
  }
}

export async function updateKycStatus(
  userId: string,
  status: 'approved' | 'rejected',
  reviewedBy: string,
  rejectionReason?: string
): Promise<void> {
  await supabase
    .from('kyc_verifications')
    .update({
      status,
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewedBy,
      rejection_reason: rejectionReason || null,
    })
    .eq('user_id', userId);
}

export async function getPendingKyc(): Promise<(KycVerification & { user: User | null })[]> {
  const { data, error } = await supabase
    .from('kyc_verifications')
    .select('*')
    .eq('status', 'pending')
    .order('submitted_at', { ascending: false });

  if (error || !data) return [];

  const result = [];
  for (const kyc of data as KycVerification[]) {
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', kyc.user_id)
      .maybeSingle();
    result.push({ ...kyc, user: user as User | null });
  }

  return result;
}

// ============ SUBSCRIPTIONS ============

export async function getSubscription(userId: string): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as Subscription;
}

export async function updateSubscription(userId: string, plan: string, price: number): Promise<void> {
  const existing = await getSubscription(userId);
  if (existing) {
    await supabase
      .from('subscriptions')
      .update({
        plan,
        price,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        is_active: true,
      })
      .eq('user_id', userId);
  } else {
    await supabase.from('subscriptions').insert({
      id: generateId('sub-'),
      user_id: userId,
      plan,
      price,
      started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      is_active: true,
    });
  }

  if (plan !== 'basic') {
    await supabase
      .from('technician_profiles')
      .update({ is_premium: true })
      .eq('user_id', userId);
  }
}

// ============ DISPUTES ============

export async function createDispute(data: {
  job_id: string;
  raised_by: string;
  against: string;
  reason: string;
  evidence_urls?: string;
}): Promise<void> {
  await supabase.from('disputes').insert({
    id: generateId('disp-'),
    ...data,
    status: 'open',
  });

  await supabase
    .from('jobs')
    .update({ status: 'disputed' })
    .eq('id', data.job_id);
}

export async function getDisputes(): Promise<Dispute[]> {
  const { data, error } = await supabase
    .from('disputes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as any[];
}

export async function resolveDispute(id: string, status: string, resolvedBy: string, notes: string): Promise<void> {
  await supabase
    .from('disputes')
    .update({
      status,
      resolved_by: resolvedBy,
      resolved_at: new Date().toISOString(),
      admin_notes: notes,
    })
    .eq('id', id);
}

// ============ SOS ============

export async function createSosAlert(data: {
  job_id: string;
  triggered_by: string;
  alert_type: string;
  lat?: number;
  lng?: number;
}): Promise<void> {
  await supabase.from('sos_alerts').insert({
    id: generateId('sos-'),
    ...data,
    status: 'active',
  });
}

export async function getSosAlerts(): Promise<SosAlert[]> {
  const { data, error } = await supabase
    .from('sos_alerts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as SosAlert[];
}

export async function resolveSosAlert(id: string, resolvedBy: string, status: 'resolved' | 'false_alarm'): Promise<void> {
  await supabase
    .from('sos_alerts')
    .update({
      status,
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
    })
    .eq('id', id);
}

// ============ ADMIN ============

export async function getAllUsers(): Promise<User[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as User[];
}

export async function getAllJobs(): Promise<Job[]> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as Job[];
}

export async function getAllPayments(): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as Payment[];
}

export async function updateUserStatus(id: string, isActive: boolean): Promise<void> {
  await supabase.from('users').update({ is_active: isActive }).eq('id', id);
}

// ============ HELPERS ============

export async function getUserById(id: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;
  return data as User;
}

export async function getTechnicianProfile(userId: string): Promise<TechnicianProfile | null> {
  const { data, error } = await supabase
    .from('technician_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as TechnicianProfile;
}
