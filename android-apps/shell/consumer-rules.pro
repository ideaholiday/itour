# The site calls these through window.IdeaHolidayApp; R8 must keep their names.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
