from django.urls import path, include
from django.views.generic import TemplateView

urlpatterns = [
    path('api/', include('issues.urls')),
    path('', TemplateView.as_view(template_name='index.html'), name='dashboard'),
]
