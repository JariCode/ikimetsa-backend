import mongoose from 'mongoose';

const logSchema = new mongoose.Schema({
  action: { type: String, required: true }, // esim. "USER_REGISTER", "USER_DELETE"
  details: { type: String, required: true }, // tarkempi kuvaus tapahtumasta
  performedBy: { type: String, required: true }, // käyttäjänimi tai "Järjestelmä"
  ipAddress: { type: String }
}, { timestamps: true });

export default mongoose.model('Log', logSchema);