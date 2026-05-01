from django.urls import path
from . import views

urlpatterns = [
    path('reporters/', views.reporters_view, name='reporters'),
    path('issues/stats/', views.issues_stats, name='issues-stats'),
    path('issues/search/', views.issues_search, name='issues-search'),
    path('issues/', views.issues_view, name='issues'),
]
