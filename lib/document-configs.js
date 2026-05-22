export const documentConfigs = [
  {
    id: 'pkwt',
    label: 'PKWT',
    description: 'Perjanjian Kerja Waktu Tertentu',
    color: 'blue',
    fields: [
      { key: 'nomor_surat', label: 'Nomor Surat', type: 'text', required: true },
      { key: 'bulan', label: 'Bulan (Romawi)', type: 'text', required: true },
      { key: 'nama_karyawan', label: 'Nama Karyawan', type: 'text', required: true },
      { key: 'tempat_lahir', label: 'Tempat Lahir', type: 'text', required: true },
      { key: 'tanggal_lahir', label: 'Tanggal Lahir', type: 'date', required: true },
      { key: 'alamat', label: 'Alamat', type: 'textarea', required: true },
      { key: 'nik', label: 'Nomor KTP (NIK)', type: 'text', required: true },
      { key: 'jabatan', label: 'Jabatan', type: 'text', required: true },
      { key: 'divisi', label: 'Departemen / Divisi', type: 'text', required: true },
      { key: 'jangka_waktu', label: 'Jangka Waktu (Contoh: 3 Bulan)', type: 'text', required: true },
      { key: 'tanggal', label: 'Tanggal Mulai', type: 'text', required: true },
      { key: 'tanggal berakhir masa kontrak', label: 'Tanggal Berakhir Masa Kontrak', type: 'text', required: true },
      { key: 'gapok', label: 'Gaji Pokok', type: 'text', required: true },
      { key: 'Uang Makan', label: 'Uang Makan', type: 'text', required: false },
      { key: 'Uang Transport', label: 'Uang Transport', type: 'text', required: false },
      { key: 'Uang Kesehatan', label: 'Uang Kesehatan', type: 'text', required: false },
      { key: 'Tunjangan Fungsional', label: 'Tunjangan Fungsional', type: 'text', required: false },
      { key: 'Tunjangan Jabatan', label: 'Tunjangan Jabatan', type: 'text', required: false },
      { key: 'tgl hari ini', label: 'Tanggal Penandatanganan (Hari Ini)', type: 'text', required: true },
    ]
  },
  {
    id: 'sk',
    label: 'SK',
    description: 'Surat Keputusan',
    color: 'green',
    fields: [
      { key: 'nomor_sk', label: 'Nomor SK', type: 'text', required: true },
      { key: 'nama_karyawan', label: 'Nama Karyawan', type: 'text', required: true },
      { key: 'nik', label: 'NIK', type: 'text', required: true },
      { key: 'jabatan_lama', label: 'Jabatan Lama', type: 'text', required: false },
      { key: 'jabatan_baru', label: 'Jabatan Baru', type: 'text', required: true },
      { key: 'departemen', label: 'Departemen', type: 'text', required: true },
      { key: 'tanggal_berlaku', label: 'Tanggal Berlaku', type: 'date', required: true },
      { key: 'alasan', label: 'Alasan / Pertimbangan', type: 'textarea', required: false },
    ]
  },
  {
    id: 'memo',
    label: 'Memo',
    description: 'Memo Internal',
    color: 'yellow',
    fields: [
      { key: 'nomor_memo', label: 'Nomor Memo', type: 'text', required: true },
      { key: 'kepada', label: 'Kepada', type: 'text', required: true },
      { key: 'dari', label: 'Dari', type: 'text', required: true },
      { key: 'perihal', label: 'Perihal', type: 'text', required: true },
      { key: 'isi_memo', label: 'Isi Memo', type: 'textarea', required: true },
    ]
  },
  {
    id: 'sp',
    label: 'Surat Peringatan',
    description: 'SP 1 / SP 2 / SP 3',
    color: 'red',
    fields: [
      { key: 'nomor_sp', label: 'Nomor SP', type: 'text', required: true },
      { key: 'tingkat_sp', label: 'Tingkat SP', type: 'select', options: ['SP 1', 'SP 2', 'SP 3'], required: true },
      { key: 'nama_karyawan', label: 'Nama Karyawan', type: 'text', required: true },
      { key: 'nik', label: 'NIK', type: 'text', required: true },
      { key: 'jabatan', label: 'Jabatan', type: 'text', required: true },
      { key: 'departemen', label: 'Departemen', type: 'text', required: true },
      { key: 'pelanggaran', label: 'Jenis Pelanggaran', type: 'textarea', required: true },
      { key: 'tanggal_sp', label: 'Tanggal SP', type: 'date', required: true },
    ]
  }
];

export function getDocumentConfig(id) {
  return documentConfigs.find(config => config.id === id);
}
