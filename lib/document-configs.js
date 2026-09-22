export const documentConfigs = [
  {
    id: 'pkwt',
    label: 'PKWT',
    description: 'Perjanjian Kerja Waktu Tertentu — otomatis dari database karyawan',
    color: 'blue',
    // PKWT v2: form otomatis (PkwtAutoForm). Field di bawah hanya arsip
    // agar skema tetap konsisten; input manual tersisa: tanggal_mulai,
    // jangka_waktu (bulan), tanggal_ttd. Sisanya dari master + payroll.
    fields: [
      { key: 'tanggal_mulai', label: 'Tanggal Mulai Kontrak', type: 'date', required: true },
      { key: 'jangka_waktu', label: 'Jangka Waktu (bulan)', type: 'number', required: true },
      { key: 'tanggal_ttd', label: 'Tanggal Penandatanganan', type: 'date', required: false },
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
