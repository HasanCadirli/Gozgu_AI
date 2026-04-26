/* ================================================================
   GÖZGÜ AI — THEME TOGGLE SCRIPT
   ================================================================
   Sayfa yüklenmeden önce çalışır (flash-of-wrong-theme önleme).
   Mevcut JS kodlarına HİÇBİR müdahale yapmaz.
   ================================================================ */

(function() {
  'use strict';
  
  var STORAGE_KEY = 'gozgu-theme';

  // ─── 1. Kayıtlı temayı HEMEN uygula (DOM render'dan önce) ───
  var savedTheme = localStorage.getItem(STORAGE_KEY);
  if (savedTheme === 'light') {
    document.documentElement.classList.remove('dark');
  }
  // Default: "dark" class zaten HTML'de mevcut, dokunmuyoruz.

  // ─── 2. DOM hazır olunca toggle butonunu bağla ───
  document.addEventListener('DOMContentLoaded', function() {
    // Sayfadaki tüm toggle butonlarını bul (birden fazla olabilir)
    var toggleButtons = document.querySelectorAll('.theme-toggle-btn');
    
    if (toggleButtons.length === 0) return;

    // İkon güncelle
    function updateAllIcons() {
      var isDark = document.documentElement.classList.contains('dark');
      toggleButtons.forEach(function(btn) {
        var icon = btn.querySelector('.material-symbols-outlined');
        if (icon) {
          icon.textContent = isDark ? 'light_mode' : 'dark_mode';
        }
        btn.title = isDark ? 'Açık Temaya Geç' : 'Koyu Temaya Geç';
      });
    }

    // İlk yüklemede ikonları ayarla
    updateAllIcons();

    // Toggle işlevi
    function toggleTheme() {
      // Geçiş animasyonu
      document.documentElement.classList.add('theme-transition');
      
      // Temayı değiştir
      document.documentElement.classList.toggle('dark');
      
      // Kaydet
      var isDark = document.documentElement.classList.contains('dark');
      localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light');
      
      // İkonları güncelle
      updateAllIcons();
      
      // Geçiş animasyonunu kaldır (performans için)
      setTimeout(function() {
        document.documentElement.classList.remove('theme-transition');
      }, 500);
    }

    // Tüm butonlara event listener ekle
    toggleButtons.forEach(function(btn) {
      btn.addEventListener('click', toggleTheme);
    });
  });
})();
